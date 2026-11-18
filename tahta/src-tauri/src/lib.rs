// BK Akıllı Yoklama: pencere, Windows açılışında başlama ve tahta anahtarının güvenli saklanması.
// Ekranların ve sunucu çağrılarının tamamı web tarafında (tahta/src). Burada yalnız işletim sistemi işleri var.
//
// Tahta anahtarı (token) Windows Kimlik Bilgileri Yöneticisi'nde durur (DPAPI ile şifreli, yalnız bu Windows
// kullanıcısı okur). Diske düz metin olarak yazılmaz.

use tauri::Manager;
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const SERVIS: &str = "tr.k12.buluskure.yoklama";
const HESAP: &str = "tahta-anahtari";
const OTOMATIK: &str = "--otomatik";

fn kayit() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVIS, HESAP).map_err(|e| e.to_string())
}

#[tauri::command]
fn anahtar_oku() -> Result<Option<String>, String> {
    match kayit()?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn anahtar_yaz(deger: String) -> Result<(), String> {
    kayit()?.set_password(&deger).map_err(|e| e.to_string())
}

#[tauri::command]
fn anahtar_sil() -> Result<(), String> {
    match kayit()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Program Windows açılışında mı başlatıldı? (Saat dışındaysa web tarafı kendini kapatır.)
#[tauri::command]
fn otomatik_mi() -> bool {
    std::env::args().any(|a| a == OTOMATIK)
}

/// Windows açılışında başlamayı açar (tahta okula bağlanınca bir kez çağrılır).
#[tauri::command]
fn acilista_baslat(app: tauri::AppHandle) -> Result<(), String> {
    let al = app.autolaunch();
    if al.is_enabled().unwrap_or(false) {
        return Ok(());
    }
    al.enable().map_err(|e| e.to_string())
}

#[tauri::command]
fn kapat(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // İkinci kez açılırsa yeni pencere açılmaz; mevcut pencere öne gelir.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![OTOMATIK])))
        .invoke_handler(tauri::generate_handler![
            anahtar_oku,
            anahtar_yaz,
            anahtar_sil,
            otomatik_mi,
            acilista_baslat,
            kapat
        ])
        .run(tauri::generate_context!())
        .expect("BK Akıllı Yoklama başlatılamadı");
}
