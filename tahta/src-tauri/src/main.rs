// Windows'ta konsol penceresi açılmasın.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bk_yoklama_lib::run()
}
