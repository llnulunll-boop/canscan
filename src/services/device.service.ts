
import { Injectable, signal, WritableSignal, OnDestroy } from '@angular/core';
import { Device, DeviceStatus, DeviceType, ConnectionType } from '../models/device.model';

export interface NetworkDevicePayload {
    ip: string;
    port: number;
    name: string;
    profile: string;
}

@Injectable({
  providedIn: 'root'
})
export class DeviceService implements OnDestroy {
  devices: WritableSignal<Device[]> = signal<Device[]>([]);
  isSupported = signal(true);

  constructor() {
    if (!navigator.usb) {
      this.isSupported.set(false);
      console.error('WebUSB API is not supported by this browser.');
      // Don't return, so network simulation can still work
    } else {
      this.loadPreviouslyPermittedDevices();
      navigator.usb.addEventListener('connect', this.handleConnect);
      navigator.usb.addEventListener('disconnect', this.handleDisconnect);
    }
  }

  ngOnDestroy() {
    if (navigator.usb) {
      navigator.usb.removeEventListener('connect', this.handleConnect);
      navigator.usb.removeEventListener('disconnect', this.handleDisconnect);
    }
  }

  private handleConnect = (event: USBConnectionEvent) => {
    const newDevice = this.mapUSBDeviceToDevice(event.device);
    this.devices.update(currentDevices => {
      if (!currentDevices.some(d => d.id === newDevice.id)) {
        return [...currentDevices, newDevice];
      }
      return currentDevices;
    });
  };

  private handleDisconnect = (event: USBConnectionEvent) => {
    const disconnectedId = this.createDeviceId(event.device);
    this.devices.update(currentDevices => currentDevices.filter(d => d.id !== disconnectedId));
  };

  private createDeviceId(usbDevice: USBDevice): string {
     return `usb-${usbDevice.vendorId}-${usbDevice.productId}-${usbDevice.serialNumber || '0'}`;
  }
  
  private createNetworkDeviceId(ip: string): string {
     return `net-${ip.replace(/\./g, '-')}`;
  }

  private mapUSBDeviceToDevice(usbDevice: USBDevice): Device {
    return {
      id: this.createDeviceId(usbDevice),
      name: usbDevice.productName || 'Unknown USB Device',
      manufacturer: usbDevice.manufacturerName || 'Unknown Manufacturer',
      type: this.inferDeviceType(usbDevice),
      status: usbDevice.opened ? DeviceStatus.Connected : DeviceStatus.Ready,
      connectionType: 'USB',
      rawDevice: usbDevice,
    };
  }

  private inferDeviceType(usbDevice: USBDevice): DeviceType {
      const name = (usbDevice.productName || '').toLowerCase();
      const isPrinter = name.includes('printer') || name.includes('laserjet') || name.includes('officejet') || name.includes('deskjet');
      const isScanner = name.includes('scan') || name.includes('scanner') || name.includes('lide');
  
      if ((isPrinter && isScanner) || name.includes('3-in-1') || name.includes('all-in-one')) {
        return '3-in-1';
      }
      if (isPrinter) return 'Printer';
      if (isScanner) return 'Scanner';
      
      for (const config of usbDevice.configurations) {
        for (const iface of config.interfaces) {
          if (iface.alternates[0]?.interfaceClass === 7) return 'Printer';
        }
      }
      
      return 'Scanner';
  }

  async loadPreviouslyPermittedDevices() {
    if (!navigator.usb) return;
    const permittedDevices = await navigator.usb.getDevices();
    const usbDevices = permittedDevices.map(d => this.mapUSBDeviceToDevice(d));
    this.devices.update(current => [...current, ...usbDevices]);
  }

  async scanForUsbDevices(): Promise<void> {
    if (!navigator.usb) {
      console.log('WebUSB not supported, skipping USB scan.');
      return;
    }
    try {
      const requestedDevice = await navigator.usb.requestDevice({ filters: [] });
      this.handleConnect({ device: requestedDevice } as USBConnectionEvent);
    } catch (e) {
      console.log('No USB device selected or permission denied.');
    }
  }

  scanForNetworkDevices(): Promise<void> {
    // Real network device discovery (e.g., via mDNS or SSDP) is not possible 
    // from a standard browser environment for security reasons. 
    // This function is kept for structural purposes but will not discover devices.
    // The previous implementation used a simulation, which has been removed as per user request.
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, 500); // A small delay to simulate a quick, unsuccessful scan.
    });
  }

  addNetworkDevice(payload: NetworkDevicePayload): Promise<Device> {
    return new Promise((resolve, reject) => {
      const existing = this.devices().find(d => d.ipAddress === payload.ip);
      if (existing) {
        return reject(new Error('Device with this IP address already exists.'));
      }

      setTimeout(() => {
        const newDevice: Device = {
          id: this.createNetworkDeviceId(payload.ip),
          name: payload.name,
          manufacturer: 'Manual Entry',
          type: payload.port === 9100 ? 'Printer' : 'Scanner',
          status: DeviceStatus.Ready,
          connectionType: 'Network',
          ipAddress: payload.ip,
          port: payload.port,
          profile: payload.profile
        };
        this.devices.update(d => [...d, newDevice]);
        resolve(newDevice);
      }, 1000);
    });
  }

  editNetworkDevice(deviceId: string, payload: NetworkDevicePayload): Promise<void> {
    return new Promise((resolve, reject) => {
        const currentDevices = this.devices();
        const existingIpDevice = currentDevices.find(d => d.ipAddress === payload.ip && d.id !== deviceId);
        if (existingIpDevice) {
          return reject(new Error('Another device with this IP address already exists.'));
        }

        const updatedDevices = currentDevices.map(d => {
          if (d.id === deviceId) {
            return {
              ...d,
              id: this.createNetworkDeviceId(payload.ip), // Update ID if IP changes
              name: payload.name,
              ipAddress: payload.ip,
              port: payload.port,
              profile: payload.profile,
            };
          }
          return d;
        });
        
        this.devices.set(updatedDevices);
        resolve();
    });
  }

  async connectDevice(deviceId: string): Promise<void> {
    const device = this.devices().find(d => d.id === deviceId);
    if (!device) throw new Error('Device not found.');
    if (device.connectionType !== 'USB' || !device.rawDevice) {
       console.log('Connect action is only for USB devices.');
       return;
    }

    try {
      await device.rawDevice.open();
      if (device.rawDevice.configuration === null && device.rawDevice.configurations.length > 0) {
        await device.rawDevice.selectConfiguration(device.rawDevice.configurations[0].configurationValue);
      }
      
      // The call to claimInterface was removed because it fails on devices with protected
      // interfaces (like many printers), throwing a "protected class" error.
      // Since this application simulates device actions (scan, print) and doesn't
      // perform real data transfer, claiming an interface is not necessary.
      // Successfully opening the device is sufficient to consider it 'Connected'.

      this.devices.update(list => list.map(d => d.id === deviceId ? { ...d, status: DeviceStatus.Connected } : d));
    } catch (e: any) {
      this.devices.update(list => list.map(d => d.id === deviceId ? { ...d, status: DeviceStatus.Error } : d));
      console.error('Failed to connect to device:', e);
      throw new Error(`Connection failed: ${e.message}. The device might be in use by another application.`);
    }
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    const device = this.devices().find(d => d.id === deviceId);
    if (!device || device.connectionType !== 'USB' || !device.rawDevice || !device.rawDevice.opened) return;

    try {
       if (device.rawDevice.configuration?.interfaces.length > 0) {
         await device.rawDevice.releaseInterface(device.rawDevice.configuration.interfaces[0].interfaceNumber);
       }
      await device.rawDevice.close();
      this.devices.update(list => list.map(d => d.id === deviceId ? { ...d, status: DeviceStatus.Ready } : d));
    } catch (e: any) {
      this.devices.update(list => list.map(d => d.id === deviceId ? { ...d, status: DeviceStatus.Error } : d));
      console.error('Failed to disconnect device:', e);
      throw new Error('Failed to disconnect cleanly.');
    }
  }
}
