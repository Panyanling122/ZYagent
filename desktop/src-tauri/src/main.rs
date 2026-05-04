#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn get_base_dir() -> Result<PathBuf, String> {
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .map_err(|_| "Cannot find home directory".to_string())?;
    Ok(PathBuf::from(home).join("OpenClaw"))
}

#[tauri::command]
fn show_notification(title: String, body: String) -> Result<(), String> {
    println!("[Notification] {}: {}", title, body);
    Ok(())
}

#[tauri::command]
fn write_local_file(path: String, content: String) -> Result<(), String> {
    let base = get_base_dir()?;
    let full = base.join(&path);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(full, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_local_file(path: String) -> Result<String, String> {
    let base = get_base_dir()?;
    let full = base.join(&path);
    fs::read_to_string(full).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_with_default_app(path: String) -> Result<(), String> {
    let base = get_base_dir()?;
    let full = base.join(&path);

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open").arg(&full).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&full).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", "start", ""]).arg(&full).spawn().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn get_local_files(dir: String) -> Result<Vec<String>, String> {
    let base = get_base_dir()?.join(&dir);
    if !base.exists() {
        return Ok(vec![]);
    }
    let mut files = vec![];
    for entry in fs::read_dir(base).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        files.push(entry.file_name().to_string_lossy().to_string());
    }
    Ok(files)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            show_notification,
            write_local_file,
            read_local_file,
            open_with_default_app,
            get_local_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
