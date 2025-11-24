// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
struct DiskItem {
    name: String,
    path: String,
    size: u64,
    is_directory: bool,
    item_count: usize,
}

#[derive(Debug, Serialize)]
struct ScanResult {
    items: Vec<DiskItem>,
}

// 使用 Rust 原生 API + rayon 并行处理（快速且无权限弹窗）
#[tauri::command]
fn scan_directory_fast(path: String) -> Result<ScanResult, String> {
    use rayon::prelude::*;
    
    let path_obj = Path::new(&path);
    
    // 读取目录内容
    let entries: Vec<_> = match fs::read_dir(path_obj) {
        Ok(entries) => entries.filter_map(|e| e.ok()).collect(),
        Err(e) => return Err(format!("读取目录失败: {}", e)),
    };
    
    // 使用 rayon 并行处理所有条目
    let items: Vec<DiskItem> = entries
        .par_iter()
        .filter_map(|entry| {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            // 跳过隐藏文件
            if name.starts_with('.') {
                return None;
            }
            
            // 获取元数据
            let metadata = match entry_path.metadata() {
                Ok(m) => m,
                Err(_) => return None,
            };
            
            let is_directory = metadata.is_dir();
            
            // 计算大小
            let size = if is_directory {
                // 使用 walkdir 计算目录大小（准确可靠）
                calculate_dir_size_walkdir(&entry_path)
            } else {
                metadata.len()
            };
            
            Some(DiskItem {
                name,
                path: entry_path.to_string_lossy().to_string(),
                size,
                is_directory,
                item_count: 0,
            })
        })
        .collect();
    
    // 按大小降序排序
    let mut items = items;
    items.sort_by(|a, b| b.size.cmp(&a.size));
    
    Ok(ScanResult { items })
}

// 完整扫描目录（和快速扫描相同）
#[tauri::command]
fn scan_directory(path: String) -> Result<ScanResult, String> {
    scan_directory_fast(path)
}

// 使用 walkdir 库计算目录大小（准确可靠）
fn calculate_dir_size_walkdir(path: &Path) -> u64 {
    use walkdir::WalkDir;
    
    WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

// 移动文件到废纸篓（安全删除）
#[tauri::command]
fn delete_items(paths: Vec<String>) -> Result<(), String> {
    use std::process::Command;
    
    for path in paths {
        let path_obj = Path::new(&path);
        
        if !path_obj.exists() {
            continue;
        }
        
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
                    return Err(format!("移到废纸篓失败 {}: {}", path, error_msg));
                }
            }
            Err(e) => {
                return Err(format!("移到废纸篓失败 {}: {}", path, e));
            }
        }
    }
    
    Ok(())
}

// 快速权限检测
#[tauri::command]
fn check_disk_access_permission() -> Result<bool, String> {
    // 尝试访问一个受保护的目录
    let test_path = Path::new("/Library/Application Support/com.apple.TCC");
    
    match fs::read_dir(test_path) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

// 获取用户主目录
#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    match dirs::home_dir() {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("无法获取用户主目录".to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            scan_directory_fast,
            delete_items,
            check_disk_access_permission,
            get_home_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
