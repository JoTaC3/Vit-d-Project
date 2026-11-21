use serde::Serialize;

#[derive(Serialize)]
struct UpdateInfo {
  available: bool,
  version: String,
  body: String,
}

#[cfg(desktop)]
#[tauri::command]
async fn check_and_install_update(app: tauri::AppHandle, install: bool) -> Result<UpdateInfo, String> {
  use tauri_plugin_updater::UpdaterExt;
  let updater = app.updater().map_err(|e| e.to_string())?;
  if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
    let info = UpdateInfo {
      available: true,
      version: update.version.clone(),
      body: update.body.clone().unwrap_or_default(),
    };
    if install {
      update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
      app.restart();
    }
    Ok(info)
  } else {
    Ok(UpdateInfo {
      available: false,
      version: String::new(),
      body: String::new(),
    })
  }
}

#[cfg(not(desktop))]
#[tauri::command]
async fn check_and_install_update(_install: bool) -> Result<UpdateInfo, String> {
  Ok(UpdateInfo {
    available: false,
    version: String::new(),
    body: String::new(),
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg_attr(not(desktop), allow(unused_mut))]
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder
      .plugin(tauri_plugin_updater::Builder::new().build())
      .plugin(tauri_plugin_process::init());
  }

  builder
    .invoke_handler(tauri::generate_handler![check_and_install_update])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
