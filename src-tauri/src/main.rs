// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::Window;

// ==================== 数据结构 ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DiskItem {
    name: String,
    path: String,
    size: u64,
    is_directory: bool,
    item_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>, // 用于标记权限错误等
}

#[derive(Debug, Serialize)]
struct ScanResult {
    items: Vec<DiskItem>,
}

#[derive(Debug, Serialize, Clone)]
struct ScanProgress {
    percent: u8,
    current: usize,
    total: usize,
    current_item: String,
    elapsed_seconds: u64,
    estimated_remaining_seconds: u64,
}

#[derive(Debug, Serialize, Clone)]
enum ErrorType {
    PermissionDenied,
    NotFound,
    IOError,
}

impl From<&std::io::Error> for ErrorType {
    fn from(error: &std::io::Error) -> Self {
        use std::io::ErrorKind;
        match error.kind() {
            ErrorKind::PermissionDenied => ErrorType::PermissionDenied,
            ErrorKind::NotFound => ErrorType::NotFound,
            ErrorKind::InvalidInput | ErrorKind::UnexpectedEof => ErrorType::IOError,
            _ => ErrorType::IOError,
        }
    }
}

// ==================== 智能过滤规则 ====================

lazy_static! {
    // 常见冗余目录/文件的正则模式
    static ref SKIP_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"node_modules$").unwrap(),
        Regex::new(r"\.git$").unwrap(),
        Regex::new(r"__pycache__$").unwrap(),
        Regex::new(r"\.cache$").unwrap(),
        Regex::new(r"\.venv$").unwrap(),
        Regex::new(r"venv$").unwrap(),
        Regex::new(r"\.pytest_cache$").unwrap(),
        Regex::new(r"\.mypy_cache$").unwrap(),
        Regex::new(r"target/debug$").unwrap(), // Rust debug 目录
        Regex::new(r"build$").unwrap(),
        Regex::new(r"dist$").unwrap(),
        Regex::new(r"\.idea$").unwrap(),
        Regex::new(r"\.vscode$").unwrap(),
    ];

    // 高优先级目录 (用户常清理的目录)
    static ref PRIORITY_DIRS: Vec<&'static str> = vec![
        "Downloads",
        "Documents", 
        "Desktop",
        "Movies",
        "Music",
        "Pictures",
    ];
}

// 检查路径是否应该被跳过
fn should_skip_path(path: &Path, enable_smart_filter: bool) -> bool {
    if !enable_smart_filter {
        return false;
    }

    let path_str = path.to_string_lossy();
    SKIP_PATTERNS.iter().any(|pattern| pattern.is_match(&path_str))
}

// 获取目录优先级权重 (数值越大越优先)
fn get_dir_priority(path: &Path) -> u8 {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    if PRIORITY_DIRS.iter().any(|&d| name.contains(d)) {
        return 10; // 高优先级
    }
    0 // 普通优先级
}

// ==================== 动态线程池配置 ====================

fn get_optimal_thread_count() -> usize {
    let cpu_count = num_cpus::get();
    
    // TODO: 检测磁盘类型 (SSD vs HDD)
    // 目前假设是 SSD,使用 CPU 核心数的 1.5 倍
    // 未来可用 diskutil 命令判断: diskutil info / | grep "Solid State"
    let is_ssd = true; // 简化实现,默认 SSD
    
    if is_ssd {
        (cpu_count * 3 / 2).max(4) // SSD: 1.5x,最少 4 线程
    } else {
        (cpu_count / 2).max(2) // HDD: 0.5x,最少 2 线程
    }
}

fn init_rayon_pool() {
    let thread_count = get_optimal_thread_count();
    rayon::ThreadPoolBuilder::new()
        .num_threads(thread_count)
        .build_global()
        .ok(); // 忽略重复初始化错误
}

// ==================== 硬链接去重 (inode 追踪) ====================

type InodeSet = Arc<Mutex<HashSet<u64>>>;

fn is_duplicate_inode(inode: u64, seen_inodes: &InodeSet) -> bool {
    let mut set = seen_inodes.lock().unwrap();
    !set.insert(inode) // 如果已存在,返回 true
}

// ==================== 扫描核心逻辑 ====================

// 使用 walkdir 计算目录大小 (支持智能过滤、硬链接去重)
// 增加进度回调支持
fn calculate_dir_size_walkdir(
    path: &Path,
    enable_smart_filter: bool,
    seen_inodes: &InodeSet,
) -> u64 {
    use walkdir::WalkDir;

    WalkDir::new(path)
        .follow_links(false)
        .max_depth(10) // 限制递归深度，避免无限深入
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            // 应用智能过滤
            !should_skip_path(e.path(), enable_smart_filter)
        })
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .filter_map(|m| {
            // 硬链接去重
            let inode = m.ino();
            if is_duplicate_inode(inode, seen_inodes) {
                None // 跳过重复的 inode
            } else {
                Some(m.blocks() * 512) // 返回实际磁盘占用
            }
        })
        .sum()
}

// ==================== 快速扫描 (两阶段优化版) ====================

#[tauri::command]
async fn scan_directory_fast(
    path: String,
    window: Window,
    enable_smart_filter: Option<bool>,
) -> Result<ScanResult, String> {
    use rayon::prelude::*;

    // 初始化线程池
    init_rayon_pool();

    let enable_filter = enable_smart_filter.unwrap_or(true);
    let path_obj = Path::new(&path);

    // 读取目录内容
    let entries: Vec<_> = match fs::read_dir(path_obj) {
        Ok(entries) => entries.filter_map(|e| e.ok()).collect(),
        Err(e) => return Err(format!("读取目录失败: {}", e)),
    };

    let total = entries.len();
    let start_time = SystemTime::now();

    // 发送初始进度
    let _ = window.emit(
        "scan-progress",
        ScanProgress {
            percent: 5,
            current: 0,
            total,
            current_item: "正在读取目录列表...".to_string(),
            elapsed_seconds: 0,
            estimated_remaining_seconds: 0,
        },
    );

    // 第一阶段: 快速收集基本信息
    let mut items: Vec<DiskItem> = entries
        .iter()
        .filter_map(|entry| {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // 跳过隐藏文件
            if name.starts_with('.') {
                return None;
            }

            // 智能过滤
            if should_skip_path(&entry_path, enable_filter) {
                return None;
            }

            // 获取元数据
            let metadata = match entry_path.metadata() {
                Ok(m) => m,
                Err(e) => {
                    let error_type = ErrorType::from(&e);
                    let error_msg = match error_type {
                        ErrorType::PermissionDenied => "无权限访问",
                        ErrorType::NotFound => "文件不存在",
                        ErrorType::IOError => "磁盘 I/O 错误",
                    };
                    return Some(DiskItem {
                        name,
                        path: entry_path.to_string_lossy().to_string(),
                        size: 0,
                        is_directory: false,
                        item_count: 0,
                        file_type: None,
                        error: Some(error_msg.to_string()),
                    });
                }
            };

            let is_directory = metadata.is_dir();
            let file_type = if is_directory {
                Some("directory".to_string())
            } else {
                get_file_type(&name)
            };

            // 文件直接获取大小，目录先设为 0
            let size = if is_directory {
                0
            } else {
                metadata.blocks() * 512
            };

            Some(DiskItem {
                name,
                path: entry_path.to_string_lossy().to_string(),
                size,
                is_directory,
                item_count: 0,
                file_type,
                error: None,
            })
        })
        .collect();

    // 发送 20% 进度
    let _ = window.emit(
        "scan-progress",
        ScanProgress {
            percent: 20,
            current: items.len(),
            total: items.len(),
            current_item: "正在计算目录大小...".to_string(),
            elapsed_seconds: start_time.elapsed().unwrap_or_default().as_secs(),
            estimated_remaining_seconds: 0,
        },
    );

    // 第二阶段: 并行计算目录大小
    let dirs_count = items.iter().filter(|i| i.is_directory).count();
    let processed_dirs = Arc::new(AtomicUsize::new(0));
    let seen_inodes: InodeSet = Arc::new(Mutex::new(HashSet::new()));

    // 并行计算每个目录的大小
    let dir_sizes: Vec<(String, u64)> = items
        .par_iter()
        .filter(|item| item.is_directory)
        .map(|item| {
            let path = Path::new(&item.path);
            let size = calculate_dir_size_walkdir(path, enable_filter, &seen_inodes);
            
            // 更新进度
            let curr = processed_dirs.fetch_add(1, Ordering::Relaxed) + 1;
            let base_percent = 20;
            let progress_percent = base_percent + ((curr as f64 / dirs_count.max(1) as f64) * 75.0) as u8;
            
            let elapsed = start_time.elapsed().unwrap_or_default().as_secs();
            let speed = if elapsed > 0 { curr as f64 / elapsed as f64 } else { 0.0 };
            let remaining = if speed > 0.0 && dirs_count > curr {
                ((dirs_count - curr) as f64 / speed) as u64
            } else {
                0
            };

            let _ = window.emit(
                "scan-progress",
                ScanProgress {
                    percent: progress_percent.min(95),
                    current: curr,
                    total: dirs_count,
                    current_item: item.name.clone(),
                    elapsed_seconds: elapsed,
                    estimated_remaining_seconds: remaining,
                },
            );

            (item.path.clone(), size)
        })
        .collect();

    // 更新目录大小
    let size_map: HashMap<String, u64> = dir_sizes.into_iter().collect();
    for item in &mut items {
        if item.is_directory {
            if let Some(&size) = size_map.get(&item.path) {
                item.size = size;
            }
        }
    }

    // 按优先级和大小排序
    items.sort_by(|a, b| {
        let a_priority = get_dir_priority(Path::new(&a.path));
        let b_priority = get_dir_priority(Path::new(&b.path));
        if a_priority != b_priority {
            b_priority.cmp(&a_priority)
        } else {
            b.size.cmp(&a.size)
        }
    });

    // 发送 100% 完成信号
    let _ = window.emit(
        "scan-progress",
        ScanProgress {
            percent: 100,
            current: dirs_count,
            total: dirs_count,
            current_item: "完成".to_string(),
            elapsed_seconds: start_time.elapsed().unwrap_or_default().as_secs(),
            estimated_remaining_seconds: 0,
        },
    );

    Ok(ScanResult { items })
}

// ==================== 文件类型识别 ====================

fn get_file_type(filename: &str) -> Option<String> {
    let extension = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match extension.to_lowercase().as_str() {
        "mp4" | "mov" | "avi" | "mkv" | "wmv" | "flv" | "webm" => Some("video".to_string()),
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" => Some("audio".to_string()),
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" | "webp" | "heic" => {
            Some("image".to_string())
        }
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "rtf" => {
            Some("document".to_string())
        }
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" => Some("archive".to_string()),
        "dmg" | "pkg" | "app" | "exe" => Some("application".to_string()),
        "log" | "tmp" | "cache" => Some("cache".to_string()),
        _ => Some("other".to_string()),
    }
}

// ==================== 完整扫描 (与快速扫描相同) ====================

#[tauri::command]
async fn scan_directory(
    path: String,
    window: Window,
    enable_smart_filter: Option<bool>,
) -> Result<ScanResult, String> {
    scan_directory_fast(path, window, enable_smart_filter).await
}

// ==================== 安全删除 (增强版) ====================

#[tauri::command]
fn delete_items(paths: Vec<String>) -> Result<String, String> {
    use std::process::Command;

    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    for path in paths {
        let path_obj = Path::new(&path);

        if !path_obj.exists() {
            errors.push(format!("{}: 文件不存在", path));
            continue;
        }

        // 检查是否是目录以及文件数量
        let (_is_dir, _item_count, _total_size) = if path_obj.is_dir() {
            let seen_inodes: InodeSet = Arc::new(Mutex::new(HashSet::new()));
            let size = calculate_dir_size_walkdir(path_obj, false, &seen_inodes);
            let count = walkdir::WalkDir::new(path_obj)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
                .count();
            (true, count, size)
        } else {
            (
                false,
                1,
                path_obj.metadata().map(|m| m.len()).unwrap_or(0),
            )
        };

        // 使用 macOS 的 osascript 移到废纸篓
        let result = Command::new("osascript")
            .arg("-e")
            .arg(format!(
                "tell application \"Finder\" to delete POSIX file \"{}\"",
                path
            ))
            .output();

        match result {
            Ok(output) => {
                if !output.status.success() {
                    let error_msg = String::from_utf8_lossy(&output.stderr);
                    errors.push(format!("{}: {}", path, error_msg));
                } else {
                    deleted.push(path.clone());
                }
            }
            Err(e) => {
                errors.push(format!("{}: {}", path, e));
            }
        }
    }

    // 返回删除结果摘要
    if errors.is_empty() {
        Ok(format!("成功删除 {} 项", deleted.len()))
    } else {
        Err(format!(
            "成功: {}, 失败: {}\n错误详情:\n{}",
            deleted.len(),
            errors.len(),
            errors.join("\n")
        ))
    }
}

// ==================== 权限检测 ====================

#[tauri::command]
fn check_disk_access_permission() -> Result<bool, String> {
    // 尝试访问一个受保护的目录
    let test_path = Path::new("/Library/Application Support/com.apple.TCC");

    match fs::read_dir(test_path) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

// ==================== 获取用户主目录 ====================

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    match dirs::home_dir() {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("无法获取用户主目录".to_string()),
    }
}

// ==================== 专项扫描 ====================

// 大文件扫描 (仅扫描超过阈值的文件)
#[tauri::command]
async fn scan_large_files(
    path: String,
    threshold_mb: u64,
    window: Window,
) -> Result<ScanResult, String> {
    use rayon::prelude::*;
    use walkdir::WalkDir;

    init_rayon_pool();

    let path_obj = Path::new(&path);
    let threshold_bytes = threshold_mb * 1024 * 1024;

    let start_time = SystemTime::now();
    let current = Arc::new(AtomicUsize::new(0));

    // 遍历所有文件
    let all_files: Vec<_> = WalkDir::new(path_obj)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();

    let total = all_files.len();

    // 并行处理,找出大文件
    let items: Vec<DiskItem> = all_files
        .par_iter()
        .filter_map(|entry| {
            let entry_path = entry.path();
            let metadata = entry_path.metadata().ok()?;
            let size = metadata.blocks() * 512;

            // 过滤小于阈值的文件
            if size < threshold_bytes {
                return None;
            }

            let name = entry_path.file_name()?.to_string_lossy().to_string();
            let file_type = get_file_type(&name);

            // 更新进度
            let curr = current.fetch_add(1, Ordering::Relaxed) + 1;
            if curr % 100 == 0 {
                let elapsed = start_time.elapsed().unwrap_or_default().as_secs();
                let percent = ((curr as f64 / total as f64) * 100.0) as u8;
                let _ = window.emit(
                    "scan-progress",
                    ScanProgress {
                        percent,
                        current: curr,
                        total,
                        current_item: name.clone(),
                        elapsed_seconds: elapsed,
                        estimated_remaining_seconds: 0,
                    },
                );
            }

            Some(DiskItem {
                name,
                path: entry_path.to_string_lossy().to_string(),
                size,
                is_directory: false,
                item_count: 0,
                file_type,
                error: None,
            })
        })
        .collect();

    // 按大小降序排序
    let mut items = items;
    items.sort_by(|a, b| b.size.cmp(&a.size));

    Ok(ScanResult { items })
}

// 旧文件扫描 (扫描超过指定天数未修改的文件)
#[tauri::command]
async fn scan_old_files(
    path: String,
    days_threshold: u64,
    window: Window,
) -> Result<ScanResult, String> {
    use rayon::prelude::*;
    use walkdir::WalkDir;

    init_rayon_pool();

    let path_obj = Path::new(&path);
    let now = SystemTime::now();
    let threshold_duration = std::time::Duration::from_secs(days_threshold * 24 * 60 * 60);

    let start_time = SystemTime::now();
    let current = Arc::new(AtomicUsize::new(0));

    // 遍历所有文件
    let all_files: Vec<_> = WalkDir::new(path_obj)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();

    let total = all_files.len();

    // 并行处理,找出旧文件
    let items: Vec<DiskItem> = all_files
        .par_iter()
        .filter_map(|entry| {
            let entry_path = entry.path();
            let metadata = entry_path.metadata().ok()?;

            // 检查最后修改时间
            let modified = metadata.modified().ok()?;
            let age = now.duration_since(modified).ok()?;

            // 过滤未超过时间阈值的文件
            if age < threshold_duration {
                return None;
            }

            let name = entry_path.file_name()?.to_string_lossy().to_string();
            let size = metadata.blocks() * 512;
            let file_type = get_file_type(&name);

            // 更新进度
            let curr = current.fetch_add(1, Ordering::Relaxed) + 1;
            if curr % 100 == 0 {
                let elapsed = start_time.elapsed().unwrap_or_default().as_secs();
                let percent = ((curr as f64 / total as f64) * 100.0) as u8;
                let _ = window.emit(
                    "scan-progress",
                    ScanProgress {
                        percent,
                        current: curr,
                        total,
                        current_item: name.clone(),
                        elapsed_seconds: elapsed,
                        estimated_remaining_seconds: 0,
                    },
                );
            }

            Some(DiskItem {
                name,
                path: entry_path.to_string_lossy().to_string(),
                size,
                is_directory: false,
                item_count: 0,
                file_type,
                error: None,
            })
        })
        .collect();

    // 按大小降序排序
    let mut items = items;
    items.sort_by(|a, b| b.size.cmp(&a.size));

    Ok(ScanResult { items })
}

// 重复文件扫描 (通过大小 + 部分哈希识别)
#[tauri::command]
async fn scan_duplicate_files(path: String, window: Window) -> Result<ScanResult, String> {
    use walkdir::WalkDir;

    init_rayon_pool();

    let path_obj = Path::new(&path);
    let start_time = SystemTime::now();

    // 第一步: 按文件大小分组
    let mut size_groups: HashMap<u64, Vec<PathBuf>> = HashMap::new();

    for entry in WalkDir::new(path_obj)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        if let Ok(metadata) = entry.metadata() {
            let size = metadata.len();
            if size > 0 {
                // 跳过空文件
                size_groups
                    .entry(size)
                    .or_insert_with(Vec::new)
                    .push(entry.path().to_path_buf());
            }
        }
    }

    // 第二步: 对每个大小组,计算部分哈希 (前 1KB + 后 1KB)
    let duplicate_candidates: Vec<_> = size_groups
        .into_iter()
        .filter(|(_, paths)| paths.len() > 1) // 只保留有多个文件的组
        .collect();

    let total = duplicate_candidates.len();
    let current = Arc::new(AtomicUsize::new(0));

    let mut all_duplicates: Vec<DiskItem> = Vec::new();

    for (size, paths) in duplicate_candidates {
        // 计算每个文件的部分哈希
        let mut hash_groups: HashMap<String, Vec<PathBuf>> = HashMap::new();

        for path in paths {
            if let Ok(hash) = calculate_partial_hash(&path) {
                hash_groups
                    .entry(hash)
                    .or_insert_with(Vec::new)
                    .push(path);
            }
        }

        // 找出有重复哈希的文件
        for (_hash, dup_paths) in hash_groups {
            if dup_paths.len() > 1 {
                // 找到重复文件!
                for dup_path in dup_paths {
                    let name = dup_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let file_type = get_file_type(&name);

                    all_duplicates.push(DiskItem {
                        name,
                        path: dup_path.to_string_lossy().to_string(),
                        size,
                        is_directory: false,
                        item_count: 0,
                        file_type,
                        error: None,
                    });
                }
            }
        }

        // 更新进度
        let curr = current.fetch_add(1, Ordering::Relaxed) + 1;
        if curr % 10 == 0 {
            let elapsed = start_time.elapsed().unwrap_or_default().as_secs();
            let percent = ((curr as f64 / total as f64) * 100.0) as u8;
            let _ = window.emit(
                "scan-progress",
                ScanProgress {
                    percent,
                    current: curr,
                    total,
                    current_item: format!("检测大小: {} 字节", size),
                    elapsed_seconds: elapsed,
                    estimated_remaining_seconds: 0,
                },
            );
        }
    }

    // 按大小降序排序
    all_duplicates.sort_by(|a, b| b.size.cmp(&a.size));

    Ok(ScanResult {
        items: all_duplicates,
    })
}

// 计算部分哈希 (前 1KB + 后 1KB)
fn calculate_partial_hash(path: &Path) -> Result<String, std::io::Error> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = fs::File::open(path)?;
    let metadata = file.metadata()?;
    let file_size = metadata.len();

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    use std::hash::Hasher;

    // 读取前 1KB
    let mut buffer = vec![0u8; 1024.min(file_size as usize)];
    file.read_exact(&mut buffer)?;
    hasher.write(&buffer);

    // 如果文件大于 2KB,读取后 1KB
    if file_size > 2048 {
        file.seek(SeekFrom::End(-1024))?;
        buffer.resize(1024, 0);
        file.read_exact(&mut buffer)?;
        hasher.write(&buffer);
    }

    Ok(format!("{:x}", hasher.finish()))
}

// ==================== 主函数 ====================

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            scan_directory_fast,
            delete_items,
            check_disk_access_permission,
            get_home_dir,
            scan_large_files,
            scan_old_files,
            scan_duplicate_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
