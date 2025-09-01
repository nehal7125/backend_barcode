export interface ScannedItem {
  id: number;
  barcode: string;
  name: string;
  price: number;
  timestamp: string;
}

export interface Product {
  name: string;
  price: number;
}

export interface ScanRequest {
  barcode: string;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}