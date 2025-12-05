
import { Component, ChangeDetectionStrategy, signal, computed, inject, WritableSignal, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Device, DeviceStatus, ConnectionType } from './models/device.model';
import { DeviceService, NetworkDevicePayload } from './services/device.service';
import { GeminiService, ExtractedDocumentData, ChatMessage } from './services/gemini.service';

export interface TroubleshootStep {
  title: string;
  details: string[];
  completed: WritableSignal<boolean>;
}

export interface Scan {
  id: string;
  name: string;
  imageUrl: string; // Base64 Data URL
  date: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule],
  providers: [DeviceService, GeminiService, DatePipe]
})
export class AppComponent {
  private deviceService = inject(DeviceService);
  private geminiService = inject(GeminiService);

  devices = this.deviceService.devices;
  isWebUsbSupported = this.deviceService.isSupported;
  selectedDevice: WritableSignal<Device | null> = signal(null);

  isScanning = signal(false);
  isNetworkScanning = signal(false);
  isConnecting = signal(false);
  connectionError = signal('');

  // Scan options
  scanResolution = signal(300);
  scanColorMode = signal('color');

  // Device Modal State (Add/Edit)
  isDeviceModalOpen = signal(false);
  editingDevice = signal<Device | null>(null);
  addByIpName = signal('HP LaserJet Pro');
  addByIpAddress = signal('192.168.1.150');
  addByIpPort = signal('9100');
  addByIpProfile = signal('Office Printer');
  addByIpError = signal('');
  isSavingDevice = signal(false);

  // Scan & History State
  scannedImageUrl = signal('');
  scanHistory: WritableSignal<Scan[]> = signal([]);
  isRenamingScanId: WritableSignal<string | null> = signal(null);
  renameScanValue = signal('');
  
  // Troubleshoot Modal State
  isTroubleshootModalOpen = signal(false);
  isTroubleshooting = signal(false);
  selectedIssue = signal('paper_jam');
  troubleshootingSteps = signal<TroubleshootStep[]>([]);
  issueResolutionFeedback = signal<'resolved' | 'unresolved' | null>(null);

  // AI Analysis Modal State
  isAiModalOpen = signal(false);
  analyzingScan = signal<Scan | null>(null);
  aiAnalysisPrompt = signal('Extract all text from this document. If it is a receipt, also provide the total amount.');
  isAnalyzing = signal(false);
  aiAnalysisResult = signal('');

  // Structured Data Extraction State
  structuredData = signal<ExtractedDocumentData[]>([]);
  isExtracting = signal(false);
  dataFilter = signal('');

  // Chatbot State
  isChatbotOpen = signal(false);
  chatHistory: WritableSignal<ChatMessage[]> = signal([]);
  isChatbotThinking = signal(false);
  currentChatMessage = signal('');

  // Image Generation State
  isImageGenerationModalOpen = signal(false);
  imageGenPrompt = signal('A high-resolution, photorealistic image of a sleek, modern scanner on a clean, minimalist desk.');
  imageGenAspectRatio = signal('16:9');
  isGeneratingImage = signal(false);
  generatedImageUrl = signal('');
  imageGenError = signal('');
  aspectRatios = signal(['1:1', '3:4', '4:3', '9:16', '16:9']);

  filteredData = computed(() => {
    const filter = this.dataFilter().toLowerCase().trim();
    const data = this.structuredData();
    if (!filter) {
      return data;
    }
    return data.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(filter)
      )
    );
  });

  constructor() {
    // Load scan settings from localStorage
    const savedResolution = localStorage.getItem('scanResolution');
    if (savedResolution) {
      this.scanResolution.set(parseInt(savedResolution, 10));
    }
    const savedColorMode = localStorage.getItem('scanColorMode');
    if (savedColorMode) {
      this.scanColorMode.set(savedColorMode);
    }
    
    // Load scan history from localStorage
    const savedHistory = localStorage.getItem('scanHistory');
    if (savedHistory) {
      this.scanHistory.set(JSON.parse(savedHistory));
    }

    // Load structured data from localStorage
    const savedStructuredData = localStorage.getItem('structuredData');
    if (savedStructuredData) {
      this.structuredData.set(JSON.parse(savedStructuredData));
    }


    // Save settings and history to localStorage on change
    effect(() => {
        localStorage.setItem('scanResolution', String(this.scanResolution()));
        localStorage.setItem('scanColorMode', this.scanColorMode());
        localStorage.setItem('scanHistory', JSON.stringify(this.scanHistory()));
        localStorage.setItem('structuredData', JSON.stringify(this.structuredData()));
    });

    effect(() => {
        const currentDevices = this.devices();
        const currentSelected = this.selectedDevice();
        if (currentSelected) {
            const updatedSelectedDevice = currentDevices.find(d => d.id === currentSelected.id);
            if (updatedSelectedDevice) {
                this.selectedDevice.set(updatedSelectedDevice);
            } else {
                this.selectedDevice.set(null);
            }
        }
    });
  }

  isActionable = computed(() => {
    const dev = this.selectedDevice();
    if (!dev) return false;
    if (dev.connectionType === 'USB') return dev.status === DeviceStatus.Connected;
    if (dev.connectionType === 'Network') return dev.status === DeviceStatus.Ready;
    return false;
  });

  async scanForUsbDevices() {
    this.isScanning.set(true);
    await this.deviceService.scanForUsbDevices();
    this.isScanning.set(false);
  }

  async scanForNetworkDevices() {
    this.isNetworkScanning.set(true);
    await this.deviceService.scanForNetworkDevices();
    this.isNetworkScanning.set(false);
  }

  selectDevice(device: Device) {
    this.selectedDevice.set(device);
    this.connectionError.set('');
    this.scannedImageUrl.set('');
  }
  
  async connectDevice(deviceId: string) {
    this.isConnecting.set(true);
    this.connectionError.set('');
    try {
      await this.deviceService.connectDevice(deviceId);
    } catch (error: any)
{
      this.connectionError.set(error.message || 'An unknown connection error occurred.');
      setTimeout(() => this.connectionError.set(''), 5000);
    } finally {
      this.isConnecting.set(false);
    }
  }

  async disconnectDevice(deviceId: string) {
    await this.deviceService.disconnectDevice(deviceId);
  }

  // Device Modal Methods
  openDeviceModal(device: Device | null = null) {
    if (device && device.connectionType === 'Network') {
      // Edit mode
      this.editingDevice.set(device);
      this.addByIpName.set(device.name);
      this.addByIpAddress.set(device.ipAddress || '');
      this.addByIpPort.set(String(device.port || ''));
      this.addByIpProfile.set(device.profile || '');
    } else {
      // Add mode
      this.editingDevice.set(null);
      this.addByIpName.set('HP LaserJet Pro');
      this.addByIpAddress.set('192.168.1.150');
      this.addByIpPort.set('9100');
      this.addByIpProfile.set('Office Printer');
    }
    this.isDeviceModalOpen.set(true);
    this.addByIpError.set('');
    this.isSavingDevice.set(false);
  }

  closeDeviceModal() {
    this.isDeviceModalOpen.set(false);
    this.editingDevice.set(null);
  }

  async confirmSaveDevice() {
    this.addByIpError.set('');
    const payload: NetworkDevicePayload = {
        name: this.addByIpName().trim(),
        ip: this.addByIpAddress().trim(),
        port: parseInt(this.addByIpPort().trim(), 10),
        profile: this.addByIpProfile().trim(),
    };

    if (!payload.name) { this.addByIpError.set('Device Name is required.'); return; }
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(payload.ip)) { this.addByIpError.set('Please enter a valid IP address.'); return; }
    if (isNaN(payload.port) || payload.port < 1 || payload.port > 65535) { this.addByIpError.set('Please enter a valid port number (1-65535).'); return; }
    if (!payload.profile) { this.addByIpError.set('Profile Name is required.'); return; }

    this.isSavingDevice.set(true);
    try {
      const deviceToEdit = this.editingDevice();
      if (deviceToEdit) {
        await this.deviceService.editNetworkDevice(deviceToEdit.id, payload);
      } else {
        await this.deviceService.addNetworkDevice(payload);
      }
      this.closeDeviceModal();
    } catch (e: any) {
      this.addByIpError.set(e.message);
    } finally {
      this.isSavingDevice.set(false);
    }
  }

  startScan() {
    this.scannedImageUrl.set('');
    // Trigger hidden file input
    (document.getElementById('scan-file-input') as HTMLInputElement)?.click();
  }

  handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        this.scannedImageUrl.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    input.value = ''; // Reset input to allow re-upload of same file
  }
  
  saveToHistory() {
    const url = this.scannedImageUrl();
    if (!url) return;
    
    const newScan: Scan = {
      id: `scan-${Date.now()}`,
      name: `Scan ${new Date().toLocaleString()}`,
      imageUrl: url,
      date: new Date().toISOString()
    };
    
    this.scanHistory.update(history => [newScan, ...history]);
    this.scannedImageUrl.set(''); // Clear preview after saving
  }
  
  downloadScan() {
    const url = this.scannedImageUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-${new Date().getTime()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  viewScan(scan: Scan) {
    this.scannedImageUrl.set(scan.imageUrl);
  }

  deleteScan(scanId: string) {
    // Clear preview if the deleted scan is being viewed
    const scanToDelete = this.scanHistory().find(s => s.id === scanId);
    if(scanToDelete && this.scannedImageUrl() === scanToDelete.imageUrl) {
        this.scannedImageUrl.set('');
    }
    this.scanHistory.update(history => history.filter(s => s.id !== scanId));
  }

  startRename(scan: Scan) {
    this.isRenamingScanId.set(scan.id);
    this.renameScanValue.set(scan.name);
  }

  cancelRename() {
    this.isRenamingScanId.set(null);
  }

  confirmRename(scanId: string) {
    const newName = this.renameScanValue().trim();
    if (!newName) {
        this.cancelRename();
        return;
    };
    
    this.scanHistory.update(history => 
      history.map(s => s.id === scanId ? { ...s, name: newName } : s)
    );
    this.isRenamingScanId.set(null);
  }
  
  printTestPage() {
    alert(`A real implementation would send a command to ${this.selectedDevice()?.name}.`);
  }

  openTroubleshootModal() {
    this.troubleshootingSteps.set([]);
    this.isTroubleshooting.set(false);
    this.issueResolutionFeedback.set(null);
    this.isTroubleshootModalOpen.set(true);
  }
  
  closeTroubleshootModal() {
    this.isTroubleshootModalOpen.set(false);
  }

  onIssueChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    this.selectedIssue.set(selectElement.value);
  }

  async getTroubleshootingSteps() {
    const device = this.selectedDevice();
    if (!device) return;
    
    this.isTroubleshooting.set(true);
    this.troubleshootingSteps.set([]);
    this.issueResolutionFeedback.set(null);
    
    const issueMap: { [key: string]: string } = {
        'paper_jam': 'it has a paper jam',
        'wont_connect': 'it will not connect to the computer',
        'poor_quality': 'the print/scan quality is very poor',
        'offline': 'it appears as offline'
    };
    const issueDescription = issueMap[this.selectedIssue()];
    
    try {
      const result = await this.geminiService.getTroubleshootingSteps(device.name, issueDescription);
      const stepsWithState: TroubleshootStep[] = result.steps.map(step => ({
        ...step,
        completed: signal(false)
      }));
      this.troubleshootingSteps.set(stepsWithState);
    } finally {
      this.isTroubleshooting.set(false);
    }
  }

  toggleStepCompletion(step: TroubleshootStep) {
    step.completed.update(c => !c);
  }

  submitFeedback(resolved: boolean) {
    this.issueResolutionFeedback.set(resolved ? 'resolved' : 'unresolved');
  }

  // AI Analysis Methods
  openAiAnalysisModal(scan: Scan) {
    this.analyzingScan.set(scan);
    this.aiAnalysisPrompt.set('Extract all text from this document. If it is a receipt, also provide the total amount.');
    this.aiAnalysisResult.set('');
    this.isAnalyzing.set(false);
    this.isAiModalOpen.set(true);
  }

  closeAiAnalysisModal() {
    this.isAiModalOpen.set(false);
    this.analyzingScan.set(null);
  }

  async performAiAnalysis() {
    const scan = this.analyzingScan();
    const prompt = this.aiAnalysisPrompt();
    if (!scan || !prompt) return;

    this.isAnalyzing.set(true);
    this.aiAnalysisResult.set('');

    try {
      const result = await this.geminiService.analyzeImage(scan.imageUrl, prompt);
      this.aiAnalysisResult.set(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      this.aiAnalysisResult.set(`An error occurred during analysis: ${errorMessage}`);
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  async quickActionExtractText() {
    // Set a specific, non-editable prompt for this action
    this.aiAnalysisPrompt.set('Extract all text from this document. Only return the raw text content, without any extra formatting, titles, or commentary.');
    // Immediately trigger the analysis
    await this.performAiAnalysis();
  }

  // Structured Data Extraction Methods
  async extractAndStoreData() {
    const imageUrl = this.scannedImageUrl();
    if (!imageUrl) {
        alert("Please scan a document first.");
        return;
    }
    this.isExtracting.set(true);
    try {
        const extractedData = await this.geminiService.extractStructuredData(imageUrl);
        const newData = {
            ...extractedData,
            id: `data-${Date.now()}`,
            scanDate: new Date().toISOString()
        };
        this.structuredData.update(currentData => [newData, ...currentData]);
    } catch (error) {
        console.error("Failed to extract structured data:", error);
        alert("An error occurred during data extraction. The document might not be in the expected format.");
    } finally {
        this.isExtracting.set(false);
    }
  }

  exportToCsv() {
    const data = this.filteredData();
    if (data.length === 0) {
        alert("No data to export.");
        return;
    }

    const headers: {key: keyof ExtractedDocumentData, label: string}[] = [
      { key: 'subscriberName', label: 'نام مشترک' },
      { key: 'subscriptionNumber', label: 'شماره اشتراک' },
      { key: 'nationalId', label: 'کد ملی' },
      { key: 'requestDate', label: 'تاریخ درخواست' },
      { key: 'projectNumber', label: 'شماره پروژه' },
      { key: 'officerNumber', label: 'شماره مامور' },
      { key: 'postalCode', label: 'کد پستی' },
      { key: 'propertyCode', label: 'کد ملکیت' },
      { key: 'paymentDate', label: 'تاریخ واریز وجه' },
      { key: 'scanDate', label: 'تاریخ اسکن' }
    ];

    const headerRow = headers.map(h => h.label).join(',');
    const dataRows = data.map(row => {
        return headers.map(header => {
            const value = row[header.key] || '';
            const stringValue = String(value).replace(/"/g, '""'); // Escape double quotes
            return `"${stringValue}"`; // Wrap all fields in quotes
        }).join(',');
    });

    const csvContent = [headerRow, ...dataRows].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // \uFEFF is BOM for Excel

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "extracted_data.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Chatbot Methods
  toggleChatbot() {
    this.isChatbotOpen.update(v => !v);
    if (this.isChatbotOpen()) {
      this.geminiService.startChat();
      if (this.chatHistory().length === 0) {
        this.chatHistory.set([{ role: 'model', text: 'Hello! How can I help you with your devices today?' }]);
      }
    }
  }

  async sendChatMessage() {
    const message = this.currentChatMessage().trim();
    if (!message || this.isChatbotThinking()) return;

    this.chatHistory.update(h => [...h, { role: 'user', text: message }]);
    this.currentChatMessage.set('');
    this.isChatbotThinking.set(true);

    this.chatHistory.update(h => [...h, { role: 'model', text: '' }]);
    
    try {
      const stream = this.geminiService.sendMessageStream(message);
      for await (const chunk of stream) {
        this.chatHistory.update(h => {
          const lastMessage = h[h.length - 1];
          if (lastMessage && lastMessage.role === 'model') {
            lastMessage.text += chunk;
          }
          return [...h];
        });
      }
    } catch (e) {
       this.chatHistory.update(h => {
          const lastMessage = h[h.length - 1];
          if (lastMessage && lastMessage.role === 'model') {
            lastMessage.text = 'Sorry, an error occurred. Please try again.';
          }
          return [...h];
        });
    } finally {
      this.isChatbotThinking.set(false);
    }
  }

  // Image Generation Methods
  openImageGenerationModal() {
    this.generatedImageUrl.set('');
    this.imageGenError.set('');
    this.isImageGenerationModalOpen.set(true);
  }

  closeImageGenerationModal() {
    this.isImageGenerationModalOpen.set(false);
  }
  
  async generateImage() {
    const prompt = this.imageGenPrompt();
    if (!prompt) return;

    this.isGeneratingImage.set(true);
    this.generatedImageUrl.set('');
    this.imageGenError.set('');

    try {
      const imageBytes = await this.geminiService.generateImage(prompt, this.imageGenAspectRatio());
      this.generatedImageUrl.set(`data:image/jpeg;base64,${imageBytes}`);
    } catch (error) {
      console.error("Image generation failed:", error);
      this.imageGenError.set(error instanceof Error ? error.message : "An unknown error occurred during image generation.");
    } finally {
      this.isGeneratingImage.set(false);
    }
  }
  
  downloadGeneratedImage() {
    const url = this.generatedImageUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated-image-${new Date().getTime()}.jpeg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }


  getConnectionIcon(type: ConnectionType): string {
    if (type === 'USB') {
      return `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-4m0 0V3m0 14h5.219a2 2 0 001.781-1.112l1.6-3.2A2 2 0 0019.22 8H4.78a2 2 0 00-1.399 3.688l1.6 3.2A2 2 0 006.78 17H12z" /></svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071a10 10 0 0114.142 0M1.394 8.111a15 15 0 0121.213 0" /></svg>`;
  }

  getIconForDevice(type: 'Printer' | 'Scanner' | '3-in-1'): string {
    switch (type) {
      case 'Printer': return `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m-4 4h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /><path stroke-linecap="round" stroke-linejoin="round" d="M17 9V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4" /></svg>`;
      case 'Scanner': return `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 17v-2a2 2 0 012-2h14a2 2 0 012 2v2M3 10V4a2 2 0 012-2h14a2 2 0 012 2v6m-1 5h-2a2 2 0 00-2 2v2H8v-2a2 2 0 00-2-2H5" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 10H9" /></svg>`;
      case '3-in-1': return `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h2.586a1 1 0 01.707.293l1.414 1.414a1 1 0 00.707.293H15a2 2 0 012 2v2" /></svg>`;
      default: return '';
    }
  }

  statusColorClass = computed(() => {
      const dev = this.selectedDevice();
      if (!dev) return 'bg-gray-400';
      switch(dev.status) {
          case DeviceStatus.Connected: return 'bg-green-500';
          case DeviceStatus.Ready: return 'bg-yellow-500';
          case DeviceStatus.Offline: return 'bg-gray-500';
          case DeviceStatus.Error: return 'bg-red-500';
          default: return 'bg-gray-400';
      }
  });

  statusIndicatorClass(status: DeviceStatus): string {
    switch (status) {
      case DeviceStatus.Connected: return 'bg-green-500';
      case DeviceStatus.Ready: return 'bg-yellow-500';
      case DeviceStatus.Offline: return 'bg-gray-400';
      case DeviceStatus.Error: return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  }
}
