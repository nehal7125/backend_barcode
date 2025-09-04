import Jimp from 'jimp';
import jsQR from 'jsqr';

export interface BarcodeScanResult {
  success: boolean;
  barcode?: string;
  error?: string;
  debugInfo?: string;
}

export class ImprovedBarcodeScanner {
  /**
   * Scan barcode from image buffer with improved detection
   */
  static async scanFromImageBuffer(imageBuffer: Buffer): Promise<BarcodeScanResult> {
    try {
      console.log('🔍 Starting IMPROVED barcode scan...');
      
      // Load image with Jimp
      const image = await Jimp.read(imageBuffer);
      console.log(`📸 Image loaded: ${image.bitmap.width}x${image.bitmap.height}`);
      
      const debugInfo: string[] = [];
      debugInfo.push(`Image size: ${image.bitmap.width}x${image.bitmap.height}`);
      
      // Try multiple detection methods with different image processing
      const methods = [
        { name: 'QR Code Detection', method: () => this.scanQRCode(image) },
        { name: 'Original Image Analysis', method: () => this.analyzeImage(image, 'original') },
        { name: 'Grayscale Analysis', method: () => this.analyzeImage(image.clone().grayscale(), 'grayscale') },
        { name: 'High Contrast Analysis', method: () => this.analyzeImage(image.clone().contrast(0.8), 'high-contrast') },
        { name: 'Low Contrast Analysis', method: () => this.analyzeImage(image.clone().contrast(-0.3), 'low-contrast') },
        { name: 'Brightened Analysis', method: () => this.analyzeImage(image.clone().brightness(0.3), 'brightened') },
        { name: 'Darkened Analysis', method: () => this.analyzeImage(image.clone().brightness(-0.3), 'darkened') },
        { name: 'Inverted Analysis', method: () => this.analyzeImage(image.clone().invert(), 'inverted') },
        { name: 'Blurred Analysis', method: () => this.analyzeImage(image.clone().blur(1), 'blurred') },
        { name: 'Sharpened Analysis', method: () => this.analyzeImage(image.clone().convolute([
          [0, -1, 0],
          [-1, 5, -1],
          [0, -1, 0]
        ]), 'sharpened') }
      ];
      
      for (const { name, method } of methods) {
        console.log(`🔎 Trying: ${name}`);
        debugInfo.push(`Tried: ${name}`);
        
        try {
          const result = await method();
          if (result) {
            console.log(`✅ SUCCESS with ${name}: ${result}`);
            debugInfo.push(`SUCCESS: ${name} found ${result}`);
            return {
              success: true,
              barcode: result,
              debugInfo: debugInfo.join('; ')
            };
          }
        } catch (error) {
          console.log(`❌ ${name} failed:`, error);
          debugInfo.push(`FAILED: ${name} - ${error}`);
        }
      }
      
      // If all methods fail, try a more aggressive approach
      console.log('🔄 Trying aggressive detection...');
      const aggressiveResult = await this.aggressiveDetection(image);
      if (aggressiveResult) {
        console.log(`✅ AGGRESSIVE SUCCESS: ${aggressiveResult}`);
        debugInfo.push(`AGGRESSIVE SUCCESS: ${aggressiveResult}`);
        return {
          success: true,
          barcode: aggressiveResult,
          debugInfo: debugInfo.join('; ')
        };
      }
      
      console.log('❌ All detection methods failed');
      return {
        success: false,
        error: 'No barcode detected. Try a clearer image with better lighting.',
        debugInfo: debugInfo.join('; ')
      };
      
    } catch (error) {
      console.error('💥 Error in barcode scanning:', error);
      return {
        success: false,
        error: 'Failed to process image',
        debugInfo: `Error: ${error}`
      };
    }
  }
  
  /**
   * Scan for QR codes using jsQR
   */
  private static async scanQRCode(image: Jimp): Promise<string | null> {
    try {
      const { width, height } = image.bitmap;
      const imageData = new Uint8ClampedArray(width * height * 4);
      
      // Convert Jimp bitmap to ImageData format
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          const index = (y * width + x) * 4;
          imageData[index] = pixel.r;
          imageData[index + 1] = pixel.g;
          imageData[index + 2] = pixel.b;
          imageData[index + 3] = pixel.a;
        }
      }
      
      const qrCode = jsQR(imageData, width, height);
      if (qrCode && qrCode.data) {
        return qrCode.data;
      }
      
      return null;
    } catch (error) {
      console.error('QR Code scan error:', error);
      return null;
    }
  }
  
  /**
   * Analyze image for barcode patterns
   */
  private static async analyzeImage(image: Jimp, method: string): Promise<string | null> {
    try {
      const { width, height } = image.bitmap;
      console.log(`🔍 Analyzing ${method} image: ${width}x${height}`);
      
      // Convert to grayscale array
      const grayData = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          const gray = Math.round(pixel.r * 0.299 + pixel.g * 0.587 + pixel.b * 0.114);
          grayData[y * width + x] = gray;
        }
      }
      
      // Try different line scanning strategies
      const strategies = [
        { name: 'center-lines', start: 0.3, end: 0.7, step: 1 },
        { name: 'all-lines', start: 0.1, end: 0.9, step: 2 },
        { name: 'dense-scan', start: 0.2, end: 0.8, step: 0.5 },
        { name: 'sparse-scan', start: 0.1, end: 0.9, step: 5 }
      ];
      
      for (const strategy of strategies) {
        console.log(`📏 Trying ${strategy.name} strategy`);
        
        for (let y = Math.floor(height * strategy.start); y < Math.floor(height * strategy.end); y += strategy.step) {
          const line = grayData.slice(y * width, (y + 1) * width);
          const barcode = this.extractBarcodeFromLine(line, method);
          if (barcode) {
            console.log(`✅ Found barcode with ${strategy.name} at line ${y}: ${barcode}`);
            return barcode;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error analyzing ${method}:`, error);
      return null;
    }
  }
  
  /**
   * Extract barcode from a horizontal line with improved algorithm
   */
  private static extractBarcodeFromLine(line: Uint8Array, method: string): string | null {
    try {
      // Try multiple threshold methods
      const thresholds = [
        this.calculateOtsuThreshold(line),
        this.calculateMeanThreshold(line),
        this.calculateMedianThreshold(line),
        this.calculateAdaptiveThreshold(line)
      ];
      
      for (let i = 0; i < thresholds.length; i++) {
        const threshold = thresholds[i];
        console.log(`🎯 Trying threshold ${i + 1}: ${threshold}`);
        
        const binary = line.map(pixel => pixel < threshold ? 0 : 1);
        const transitions = this.findTransitions(binary);
        
        console.log(`📊 Found ${transitions.length} transitions with threshold ${i + 1}`);
        
        if (transitions.length >= 10 && transitions.length <= 300) {
          const barcode = this.decodeBarcodeFromTransitions(transitions, line.length, method);
          if (barcode) {
            console.log(`✅ Decoded barcode with threshold ${i + 1}: ${barcode}`);
            return barcode;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error extracting barcode from line (${method}):`, error);
      return null;
    }
  }
  
  /**
   * Calculate Otsu's threshold
   */
  private static calculateOtsuThreshold(line: Uint8Array): number {
    const histogram = new Array(256).fill(0);
    for (const pixel of line) {
      histogram[pixel]++;
    }
    
    let total = line.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let varMax = 0;
    let threshold = 0;
    
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      
      wF = total - wB;
      if (wF === 0) break;
      
      sumB += t * histogram[t];
      
      let mB = sumB / wB;
      let mF = (sum - sumB) / wF;
      
      let varBetween = wB * wF * (mB - mF) * (mB - mF);
      
      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = t;
      }
    }
    
    return threshold;
  }
  
  /**
   * Calculate mean threshold
   */
  private static calculateMeanThreshold(line: Uint8Array): number {
    const sum = line.reduce((a, b) => a + b, 0);
    return Math.round(sum / line.length);
  }
  
  /**
   * Calculate median threshold
   */
  private static calculateMedianThreshold(line: Uint8Array): number {
    const sorted = [...line].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  
  /**
   * Calculate adaptive threshold
   */
  private static calculateAdaptiveThreshold(line: Uint8Array): number {
    const mean = this.calculateMeanThreshold(line);
    const std = Math.sqrt(line.reduce((sum, pixel) => sum + Math.pow(pixel - mean, 2), 0) / line.length);
    return Math.round(mean - 0.5 * std);
  }
  
  /**
   * Find transitions in binary array
   */
  private static findTransitions(binary: number[]): number[] {
    const transitions: number[] = [];
    for (let i = 1; i < binary.length; i++) {
      if (binary[i] !== binary[i - 1]) {
        transitions.push(i);
      }
    }
    return transitions;
  }
  
  /**
   * Decode barcode from transitions
   */
  private static decodeBarcodeFromTransitions(transitions: number[], lineLength: number, method: string): string | null {
    try {
      // Calculate bar widths
      const barWidths: number[] = [];
      for (let i = 1; i < transitions.length; i++) {
        barWidths.push(transitions[i] - transitions[i - 1]);
      }
      
      if (barWidths.length < 10) return null;
      
      // Normalize bar widths
      const minWidth = Math.min(...barWidths);
      const normalizedWidths = barWidths.map(width => Math.round(width / minWidth));
      
      console.log(`📏 Bar widths: ${normalizedWidths.slice(0, 20).join(',')}... (${normalizedWidths.length} total)`);
      
      // Try different decoding approaches
      const decoders = [
        () => this.decodeAsEAN13(normalizedWidths),
        () => this.decodeAsEAN8(normalizedWidths),
        () => this.decodeAsCode128(normalizedWidths),
        () => this.decodeAsUPC(normalizedWidths),
        () => this.decodeAsGeneric(normalizedWidths)
      ];
      
      for (let i = 0; i < decoders.length; i++) {
        try {
          const result = decoders[i]();
          if (result) {
            console.log(`✅ Decoder ${i + 1} succeeded: ${result}`);
            return result;
          }
        } catch (error) {
          console.log(`❌ Decoder ${i + 1} failed:`, error);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error decoding barcode (${method}):`, error);
      return null;
    }
  }
  
  /**
   * Decode as EAN-13
   */
  private static decodeAsEAN13(widths: number[]): string | null {
    if (widths.length < 59) return null;
    
    // Look for start pattern (101)
    let startIndex = -1;
    for (let i = 0; i < widths.length - 2; i++) {
      if (widths[i] === 1 && widths[i + 1] === 0 && widths[i + 2] === 1) {
        startIndex = i;
        break;
      }
    }
    
    if (startIndex === -1) return null;
    
    // Extract digits (simplified)
    const digits = this.extractDigits(widths, startIndex + 3, 12);
    if (digits && digits.length === 12) {
      const checkDigit = this.calculateEAN13CheckDigit(digits);
      return digits + checkDigit;
    }
    
    return null;
  }
  
  /**
   * Decode as EAN-8
   */
  private static decodeAsEAN8(widths: number[]): string | null {
    if (widths.length < 67) return null;
    
    const digits = this.extractDigits(widths, 3, 7);
    if (digits && digits.length === 7) {
      const checkDigit = this.calculateEAN8CheckDigit(digits);
      return digits + checkDigit;
    }
    
    return null;
  }
  
  /**
   * Decode as Code 128
   */
  private static decodeAsCode128(widths: number[]): string | null {
    if (widths.length < 20) return null;
    
    // Look for start pattern
    let startIndex = -1;
    for (let i = 0; i < widths.length - 3; i++) {
      if (widths[i] === 2 && widths[i + 1] === 1 && widths[i + 2] === 1) {
        startIndex = i;
        break;
      }
    }
    
    if (startIndex === -1) return null;
    
    const data = this.extractCode128Data(widths, startIndex + 3);
    return data;
  }
  
  /**
   * Decode as UPC
   */
  private static decodeAsUPC(widths: number[]): string | null {
    if (widths.length < 51) return null;
    
    const digits = this.extractDigits(widths, 3, 11);
    if (digits && digits.length === 11) {
      const checkDigit = this.calculateUPCACheckDigit(digits);
      return digits + checkDigit;
    }
    
    return null;
  }
  
  /**
   * Generic decoder - try to extract any numeric pattern
   */
  private static decodeAsGeneric(widths: number[]): string | null {
    if (widths.length < 20) return null;
    
    // Try to find any numeric pattern
    const pattern = widths.slice(0, Math.min(50, widths.length)).join('');
    
    // Look for common barcode patterns
    if (pattern.includes('111') && pattern.includes('000')) {
      // Try to extract a simple numeric sequence
      const digits = this.extractSimpleDigits(widths);
      if (digits && digits.length >= 8 && digits.length <= 13) {
        return digits;
      }
    }
    
    return null;
  }
  
  /**
   * Extract digits from pattern (simplified)
   */
  private static extractDigits(widths: number[], startIndex: number, digitCount: number): string | null {
    try {
      const digits: string[] = [];
      let currentIndex = startIndex;
      
      for (let i = 0; i < digitCount; i++) {
        if (currentIndex + 7 > widths.length) break;
        
        const digitPattern = widths.slice(currentIndex, currentIndex + 7);
        const digit = this.decodeDigitPattern(digitPattern);
        
        if (digit !== null) {
          digits.push(digit);
          currentIndex += 7;
        } else {
          break;
        }
      }
      
      return digits.length === digitCount ? digits.join('') : null;
    } catch (error) {
      console.error('Error extracting digits:', error);
      return null;
    }
  }
  
  /**
   * Extract simple digits (fallback method)
   */
  private static extractSimpleDigits(widths: number[]): string | null {
    try {
      // Look for patterns that might represent digits
      const digits: string[] = [];
      
      for (let i = 0; i < widths.length - 3; i += 2) {
        const pattern = widths.slice(i, i + 4);
        const digit = this.decodeSimplePattern(pattern);
        if (digit) {
          digits.push(digit);
        }
      }
      
      return digits.length >= 8 ? digits.join('') : null;
    } catch (error) {
      console.error('Error extracting simple digits:', error);
      return null;
    }
  }
  
  /**
   * Decode digit pattern (simplified)
   */
  private static decodeDigitPattern(pattern: number[]): string | null {
    const patternStr = pattern.join('');
    
    // Simplified pattern matching
    const patterns: { [key: string]: string } = {
      '3211': '0', '2221': '1', '2122': '2', '1411': '3',
      '1132': '4', '1231': '5', '1114': '6', '1312': '7',
      '1213': '8', '3112': '9'
    };
    
    for (const [key, value] of Object.entries(patterns)) {
      if (this.patternMatch(patternStr, key)) {
        return value;
      }
    }
    
    return null;
  }
  
  /**
   * Decode simple pattern (fallback)
   */
  private static decodeSimplePattern(pattern: number[]): string | null {
    const sum = pattern.reduce((a, b) => a + b, 0);
    const avg = sum / pattern.length;
    
    // Simple heuristic based on average width
    if (avg < 1.5) return '1';
    if (avg < 2.5) return '2';
    if (avg < 3.5) return '3';
    if (avg < 4.5) return '4';
    if (avg < 5.5) return '5';
    if (avg < 6.5) return '6';
    if (avg < 7.5) return '7';
    if (avg < 8.5) return '8';
    if (avg < 9.5) return '9';
    return '0';
  }
  
  /**
   * Pattern matching with tolerance
   */
  private static patternMatch(pattern1: string, pattern2: string): boolean {
    if (pattern1.length !== pattern2.length) return false;
    
    let matches = 0;
    for (let i = 0; i < pattern1.length; i++) {
      if (pattern1[i] === pattern2[i]) {
        matches++;
      }
    }
    
    return matches >= pattern1.length * 0.7; // 70% match threshold
  }
  
  /**
   * Extract Code 128 data
   */
  private static extractCode128Data(widths: number[], startIndex: number): string | null {
    try {
      const data: string[] = [];
      let currentIndex = startIndex;
      
      while (currentIndex < widths.length - 6) {
        if (currentIndex + 11 > widths.length) break;
        
        const charPattern = widths.slice(currentIndex, currentIndex + 11);
        const char = this.decodeCode128Character(charPattern);
        
        if (char) {
          data.push(char);
          currentIndex += 11;
        } else {
          break;
        }
      }
      
      return data.length > 0 ? data.join('') : null;
    } catch (error) {
      console.error('Error extracting Code 128 data:', error);
      return null;
    }
  }
  
  /**
   * Decode Code 128 character
   */
  private static decodeCode128Character(pattern: number[]): string | null {
    const patternStr = pattern.join('');
    
    // Simplified Code 128 character matching
    if (patternStr.includes('211214')) return '0';
    if (patternStr.includes('211232')) return '1';
    if (patternStr.includes('211412')) return '2';
    if (patternStr.includes('211432')) return '3';
    if (patternStr.includes('212114')) return '4';
    if (patternStr.includes('212132')) return '5';
    if (patternStr.includes('212312')) return '6';
    if (patternStr.includes('212332')) return '7';
    if (patternStr.includes('214112')) return '8';
    if (patternStr.includes('214132')) return '9';
    
    return null;
  }
  
  /**
   * Aggressive detection - try everything
   */
  private static async aggressiveDetection(image: Jimp): Promise<string | null> {
    try {
      console.log('🚀 Starting aggressive detection...');
      
      // Try multiple image transformations
      const transformations = [
        { name: 'original', image: image },
        { name: 'grayscale', image: image.clone().grayscale() },
        { name: 'high-contrast', image: image.clone().contrast(1.0) },
        { name: 'low-contrast', image: image.clone().contrast(-0.5) },
        { name: 'bright', image: image.clone().brightness(0.5) },
        { name: 'dark', image: image.clone().brightness(-0.5) },
        { name: 'inverted', image: image.clone().invert() },
        { name: 'blurred', image: image.clone().blur(2) },
        { name: 'sharpened', image: image.clone().convolute([
          [0, -1, 0],
          [-1, 5, -1],
          [0, -1, 0]
        ]) }
      ];
      
      for (const { name, image: transformedImage } of transformations) {
        console.log(`🔄 Trying aggressive ${name}...`);
        
        const result = await this.analyzeImage(transformedImage, `aggressive-${name}`);
        if (result) {
          console.log(`✅ Aggressive ${name} succeeded: ${result}`);
          return result;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in aggressive detection:', error);
      return null;
    }
  }
  
  /**
   * Calculate EAN-13 check digit
   */
  private static calculateEAN13CheckDigit(digits: string): string {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      const digit = parseInt(digits[i]);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    return ((10 - (sum % 10)) % 10).toString();
  }
  
  /**
   * Calculate EAN-8 check digit
   */
  private static calculateEAN8CheckDigit(digits: string): string {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      const digit = parseInt(digits[i]);
      sum += (i % 2 === 0) ? digit * 3 : digit;
    }
    return ((10 - (sum % 10)) % 10).toString();
  }
  
  /**
   * Calculate UPC-A check digit
   */
  private static calculateUPCACheckDigit(digits: string): string {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      const digit = parseInt(digits[i]);
      sum += (i % 2 === 0) ? digit * 3 : digit;
    }
    return ((10 - (sum % 10)) % 10).toString();
  }
  
  /**
   * Validate barcode format
   */
  static validateBarcode(barcode: string): boolean {
    const numericBarcode = barcode.replace(/\D/g, '');
    return numericBarcode.length >= 8 && numericBarcode.length <= 20;
  }
}
