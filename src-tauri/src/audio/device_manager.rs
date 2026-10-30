use windows::Win32::Media::Audio::{
    IMMDeviceEnumerator, MMDeviceEnumerator, IMMDeviceCollection, IMMDevice,
    DEVICE_STATE_ACTIVE, eRender, eConsole,
};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL, CoInitializeEx, COINIT_MULTITHREADED, STGM_READ};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    unsafe {
        // Initialize COM
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|e| format!("Failed to create device enumerator: {}", e))?;

        let collection: IMMDeviceCollection = enumerator
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .map_err(|e| format!("Failed to enumerate endpoints: {}", e))?;

        let count = collection.GetCount().map_err(|e| format!("Failed to get device count: {}", e))?;
        
        let mut devices = Vec::new();
        
        // Get default device ID
        let default_device: IMMDevice = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| format!("Failed to get default endpoint: {}", e))?;
        let default_id = default_device.GetId().map_err(|e| format!("Failed to get default ID: {}", e))?;
        let default_id_str = default_id.to_string().map_err(|e| e.to_string())?;

        for i in 0..count {
            let device = collection.Item(i).map_err(|e| format!("Failed to get device {}: {}", i, e))?;
            let id = device.GetId().map_err(|e| format!("Failed to get ID for device {}: {}", i, e))?;
            let id_str = id.to_string().map_err(|e| e.to_string())?;
            
            let property_store: IPropertyStore = device.OpenPropertyStore(STGM_READ)
                .map_err(|e| format!("Failed to open property store: {}", e))?;
            
            let prop_variant = property_store.GetValue(&PKEY_Device_FriendlyName)
                .map_err(|e| format!("Failed to get friendly name: {}", e))?;
            
            let name = prop_variant.to_string();
            
            devices.push(AudioDevice {
                id: id_str.clone(),
                name,
                is_default: id_str == default_id_str,
            });
        }
        
        Ok(devices)
    }
}
