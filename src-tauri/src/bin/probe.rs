//! Read-only hardware check: lists the headset's HID collections and reads status + settings.
//! Run with `cargo run --bin probe` while the headset dongle is plugged in.

use frazer_lib::hid::registry::{DEVICES, RAZER_VID};
use frazer_lib::hid::HeadsetManager;

fn main() {
    let api = hidapi::HidApi::new().expect("hidapi init");
    for e in DEVICES {
        for d in api.device_list().filter(|d| d.vendor_id() == RAZER_VID && d.product_id() == e.pid) {
            println!(
                "{} if={} usage_page=0x{:04X} usage=0x{:04X} path={}",
                e.name,
                d.interface_number(),
                d.usage_page(),
                d.usage(),
                d.path().to_string_lossy()
            );
        }
    }
    drop(api);

    let mgr = HeadsetManager::new().expect("hidapi init");
    match mgr.with_driver(|d| d.status()) {
        Ok(s) => println!("status: {s:?}"),
        Err(e) => {
            eprintln!("status failed: {e}");
            std::process::exit(1);
        }
    }
    let settings = match mgr.with_driver(|d| d.settings()) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("settings failed: {e}");
            std::process::exit(1);
        }
    };
    println!("settings: {settings:#?}");

    // `--rewrite` exercises every setter by writing back the values just read (no visible change).
    if std::env::args().any(|a| a == "--rewrite") {
        let s = settings.clone();
        let result = mgr.with_driver(|d| {
            if let (Some(p), Some(b)) = (s.eq_preset, &s.eq_bands) {
                d.set_eq(p, b)?;
            }
            if let (Some(on), Some(level)) = (s.sidetone_enabled, s.sidetone_level) {
                d.set_sidetone(on, level)?;
            }
            if let Some(m) = s.mic_muted {
                d.set_mic_mute(m)?;
            }
            if let Some(p) = s.mic_eq_preset {
                d.set_mic_eq_preset(p)?;
            }
            if let Some(m) = s.auto_off_minutes {
                d.set_auto_off(m)?;
            }
            d.settings()
        });
        match result {
            Ok(after) => {
                let same = format!("{after:?}") == format!("{settings:?}");
                println!("rewrite ok; settings unchanged after round-trip: {same}");
                if !same {
                    println!("after: {after:#?}");
                }
            }
            Err(e) => eprintln!("rewrite failed: {e}"),
        }
    }
}
