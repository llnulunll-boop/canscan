
export enum DeviceStatus {
  Connected = 'Connected',
  Ready = 'Ready',
  Offline = 'Offline',
  Error = 'Error'
}

export type DeviceType = 'Printer' | 'Scanner' | '3-in-1';
export type ConnectionType = 'USB' | 'Network';

export interface Device {
  id: string; // Unique ID derived from device properties
  name: string;
  manufacturer: string;
  type: DeviceType;
  status: DeviceStatus;
  connectionType: ConnectionType;
  ipAddress?: string;
  port?: number;
  profile?: string;
  rawDevice?: USBDevice; // The actual WebUSB device object, only for USB
}

// TypeScript declarations for the WebUSB API to avoid compilation errors.
declare global {
  interface USBDevice {
    vendorId: number;
    productId: number;
    manufacturerName?: string;
    productName?: string;
    serialNumber?: string;
    opened: boolean;
    configuration: USBConfiguration | null;
    configurations: readonly USBConfiguration[];
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    releaseInterface(interfaceNumber: number): Promise<void>;
  }

  interface USBConfiguration {
    configurationValue: number;
    interfaces: readonly USBInterface[];
  }

  interface USBInterface {
    interfaceNumber: number;
    alternates: readonly USBAlternateInterface[];
  }
  
  interface USBAlternateInterface {
     interfaceClass: number;
  }
  
  interface Navigator {
    usb: {
      getDevices(): Promise<USBDevice[]>;
      requestDevice(options: { filters: any[] }): Promise<USBDevice>;
      addEventListener(type: 'connect' | 'disconnect', listener: (ev: USBConnectionEvent) => any): void;
      removeEventListener(type: 'connect' | 'disconnect', listener: (ev: USBConnectionEvent) => any): void;
    }
  }

  interface USBConnectionEvent extends Event {
    readonly device: USBDevice;
  }
}
