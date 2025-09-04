import Jimp from 'jimp';
import jsQR from 'jsqr';

export interface BarcodeScanResult {
  success: boolean;
  barcode?: string;
  error?: string;
  debugInfo?: string;
}

export class RealBarcodeDecoder {
  // EAN-13 encoding tables
  private static readonly EAN13_LEFT_PATTERNS = {
    '0': [0, 0, 0, 1, 1, 0, 1],
    '1': [0, 0, 1, 1, 0, 0, 1],
    '2': [0, 0, 1, 0, 0, 1, 1],
    '3': [0, 1, 1, 1, 1, 0, 1],
    '4': [0, 1, 0, 0, 0, 1, 1],
    '5': [0, 1, 1, 0, 0, 0, 1],
    '6': [0, 1, 0, 1, 1, 1, 1],
    '7': [0, 1, 1, 1, 0, 1, 1],
    '8': [0, 1, 1, 0, 1, 1, 1],
    '9': [0, 0, 0, 1, 0, 1, 1]
  };

  private static readonly EAN13_RIGHT_PATTERNS = {
    '0': [1, 1, 1, 0, 0, 1, 0],
    '1': [1, 1, 0, 0, 1, 1, 0],
    '2': [1, 1, 0, 1, 1, 0, 0],
    '3': [1, 0, 0, 0, 0, 1, 0],
    '4': [1, 0, 1, 1, 1, 0, 0],
    '5': [1, 0, 0, 1, 1, 1, 0],
    '6': [1, 0, 1, 0, 0, 0, 0],
    '7': [1, 0, 0, 0, 1, 0, 0],
    '8': [1, 0, 0, 1, 0, 0, 0],
    '9': [1, 1, 1, 0, 1, 0, 0]
  };

  // Code 128 patterns (simplified)
  private static readonly CODE128_PATTERNS = {
    '0': [2, 1, 2, 2, 2, 2],
    '1': [2, 2, 2, 1, 2, 2],
    '2': [2, 2, 2, 2, 2, 1],
    '3': [1, 2, 1, 2, 2, 3],
    '4': [1, 2, 1, 3, 2, 2],
    '5': [1, 3, 1, 2, 2, 2],
    '6': [1, 2, 2, 2, 1, 3],
    '7': [1, 2, 2, 3, 1, 2],
    '8': [1, 3, 2, 2, 1, 2],
    '9': [2, 2, 1, 2, 1, 3]
  };

  /**
   * Main barcode scanning function
   */
  static async scanFromImageBuffer(imageBuffer: Buffer): Promise<BarcodeScanResult> {
    try {
      console.log('🔍 Starting REAL barcode number extraction...');
      
      const image = await Jimp.read(imageBuffer);
      console.log(`📸 Image loaded: ${image.bitmap.width}x${image.bitmap.height}`);
      
      const debugInfo: string[] = [];
      debugInfo.push(`Image: ${image.bitmap.width}x${image.bitmap.height}`);
      
      // Try QR code first (most reliable)
      const qrResult = await this.scanQRCode(image);
      if (qrResult) {
        console.log(`✅ QR Code found: ${qrResult}`);
        return {
          success: true,
          barcode: qrResult,
          debugInfo: `QR Code detected: ${qrResult}`
        };
      }
      
      // Try traditional barcode decoding
      const barcodeResult = await this.decodeTraditionalBarcode(image);
      if (barcodeResult) {
        console.log(`✅ Barcode decoded: ${barcodeResult}`);
        return {
          success: true,
          barcode: barcodeResult,
          debugInfo: debugInfo.join('; ')
        };
      }
      
      return {
        success: false,
        error: 'No barcode detected. Please ensure the barcode is clear and well-lit.',
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
   * Scan for QR codes
   */
  private static async scanQRCode(image: Jimp): Promise<string | null> {
    try {
      const { width, height } = image.bitmap;
      const imageData = new Uint8ClampedArray(width * height * 4);
      
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
      return qrCode?.data || null;
    } catch (error) {
      console.error('QR Code scan error:', error);
      return null;
    }
  }
  
  /**
   * Decode traditional barcodes (EAN-13, EAN-8, Code 128, UPC)
   */
  private static async decodeTraditionalBarcode(image: Jimp): Promise<string | null> {
    try {
      // Try multiple image processing approaches
      const approaches = [
        { name: 'original', image: image },
        { name: 'grayscale', image: image.clone().grayscale() },
        { name: 'high-contrast', image: image.clone().contrast(0.8) },
        { name: 'low-contrast', image: image.clone().contrast(-0.3) },
        { name: 'bright', image: image.clone().brightness(0.3) },
        { name: 'dark', image: image.clone().brightness(-0.3) },
        { name: 'inverted', image: image.clone().invert() }
      ];
      
      for (const { name, image: processedImage } of approaches) {
        console.log(`🔍 Trying ${name} approach...`);
        
        const result = await this.decodeBarcodeFromImage(processedImage, name);
        if (result) {
          console.log(`✅ ${name} approach succeeded: ${result}`);
          return result;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in traditional barcode decoding:', error);
      return null;
    }
  }
  
  /**
   * Decode barcode from processed image
   */
  private static async decodeBarcodeFromImage(image: Jimp, approach: string): Promise<string | null> {
    try {
      const { width, height } = image.bitmap;
      
      // Convert to grayscale
      const grayData = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          const gray = Math.round(pixel.r * 0.299 + pixel.g * 0.587 + pixel.b * 0.114);
          grayData[y * width + x] = gray;
        }
      }
      
      // Find the best horizontal line with barcode
      let bestLine = null;
      let bestScore = 0;
      
      for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.8); y += 1) {
        const line = grayData.slice(y * width, (y + 1) * width);
        const score = this.analyzeBarcodeLine(line);
        
        if (score > bestScore) {
          bestScore = score;
          bestLine = line;
        }
      }
      
      if (!bestLine || bestScore < 0.3) {
        console.log(`❌ No good barcode line found in ${approach} (score: ${bestScore})`);
        return null;
      }
      
      console.log(`📏 Best barcode line found in ${approach} (score: ${bestScore})`);
      
      // Decode the barcode from the best line
      return this.decodeBarcodeFromLine(bestLine, approach);
      
    } catch (error) {
      console.error(`Error decoding barcode from ${approach}:`, error);
      return null;
    }
  }
  
  /**
   * Analyze a line to determine if it contains a barcode
   */
  private static analyzeBarcodeLine(line: Uint8Array): number {
    // Calculate threshold
    const threshold = this.calculateThreshold(line);
    
    // Convert to binary
    const binary = line.map(pixel => pixel < threshold ? 0 : 1);
    
    // Count transitions
    let transitions = 0;
    for (let i = 1; i < binary.length; i++) {
      if (binary[i] !== binary[i - 1]) {
        transitions++;
      }
    }
    
    // Calculate score based on transition count and distribution
    const transitionRatio = transitions / line.length;
    const score = Math.min(transitionRatio * 10, 1); // Normalize to 0-1
    
    return score;
  }
  
  /**
   * Decode barcode from a horizontal line
   */
  private static decodeBarcodeFromLine(line: Uint8Array, approach: string): string | null {
    try {
      // Calculate threshold
      const threshold = this.calculateThreshold(line);
      const binary = line.map(pixel => pixel < threshold ? 0 : 1);
      
      // Find transitions
      const transitions: number[] = [];
      for (let i = 1; i < binary.length; i++) {
        if (binary[i] !== binary[i - 1]) {
          transitions.push(i);
        }
      }
      
      console.log(`📊 Found ${transitions.length} transitions in ${approach}`);
      
      if (transitions.length < 20) {
        console.log(`❌ Too few transitions in ${approach}`);
        return null;
      }
      
      // Calculate bar widths
      const barWidths: number[] = [];
      for (let i = 1; i < transitions.length; i++) {
        barWidths.push(transitions[i] - transitions[i - 1]);
      }
      
      // Normalize bar widths
      const minWidth = Math.min(...barWidths);
      const normalizedWidths = barWidths.map(width => Math.round(width / minWidth));
      
      console.log(`📏 Normalized bar widths: ${normalizedWidths.slice(0, 20).join(',')}...`);
      
      // Try different barcode formats
      const formats = [
        () => this.decodeEAN13(normalizedWidths),
        () => this.decodeEAN8(normalizedWidths),
        () => this.decodeCode128(normalizedWidths),
        () => this.decodeUPC(normalizedWidths)
      ];
      
      for (let i = 0; i < formats.length; i++) {
        try {
          const result = formats[i]();
          if (result) {
            console.log(`✅ Format ${i + 1} succeeded: ${result}`);
            return result;
          }
        } catch (error) {
          console.log(`❌ Format ${i + 1} failed:`, error);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error decoding barcode from line (${approach}):`, error);
      return null;
    }
  }
  
  /**
   * Decode EAN-13 barcode
   */
  private static decodeEAN13(widths: number[]): string | null {
    try {
      console.log('🔍 Trying EAN-13 decoding...');
      
      // EAN-13 has 95 modules total
      if (widths.length < 95) {
        console.log(`❌ EAN-13: Too few modules (${widths.length})`);
        return null;
      }
      
      // Look for start pattern (101)
      let startIndex = -1;
      for (let i = 0; i < widths.length - 2; i++) {
        if (widths[i] === 1 && widths[i + 1] === 0 && widths[i + 2] === 1) {
          startIndex = i;
          break;
        }
      }
      
      if (startIndex === -1) {
        console.log('❌ EAN-13: Start pattern not found');
        return null;
      }
      
      console.log(`✅ EAN-13: Start pattern found at index ${startIndex}`);
      
      // Extract left digits (6 digits)
      const leftDigits = this.extractEAN13LeftDigits(widths, startIndex + 3);
      if (!leftDigits || leftDigits.length !== 6) {
        console.log(`❌ EAN-13: Could not extract left digits (got ${leftDigits?.length || 0})`);
        return null;
      }
      
      // Look for middle pattern (01010)
      let middleIndex = startIndex + 3 + (6 * 7);
      if (middleIndex + 4 >= widths.length) {
        console.log('❌ EAN-13: Middle pattern not found');
        return null;
      }
      
      if (!(widths[middleIndex] === 0 && widths[middleIndex + 1] === 1 && 
            widths[middleIndex + 2] === 0 && widths[middleIndex + 3] === 1 && 
            widths[middleIndex + 4] === 0)) {
        console.log('❌ EAN-13: Middle pattern mismatch');
        return null;
      }
      
      console.log(`✅ EAN-13: Middle pattern found at index ${middleIndex}`);
      
      // Extract right digits (6 digits)
      const rightDigits = this.extractEAN13RightDigits(widths, middleIndex + 5);
      if (!rightDigits || rightDigits.length !== 6) {
        console.log(`❌ EAN-13: Could not extract right digits (got ${rightDigits?.length || 0})`);
        return null;
      }
      
      // Combine all digits
      const allDigits = leftDigits + rightDigits;
      
      // Calculate check digit
      const checkDigit = this.calculateEAN13CheckDigit(allDigits);
      
      const fullBarcode = allDigits + checkDigit;
      console.log(`✅ EAN-13 decoded: ${fullBarcode}`);
      
      return fullBarcode;
      
    } catch (error) {
      console.error('Error decoding EAN-13:', error);
      return null;
    }
  }
  
  /**
   * Extract left digits from EAN-13
   */
  private static extractEAN13LeftDigits(widths: number[], startIndex: number): string | null {
    try {
      const digits: string[] = [];
      let currentIndex = startIndex;
      
      for (let i = 0; i < 6; i++) {
        if (currentIndex + 7 > widths.length) break;
        
        const digitPattern = widths.slice(currentIndex, currentIndex + 7);
        const digit = this.decodeEAN13LeftDigit(digitPattern);
        
        if (digit !== null) {
          digits.push(digit);
          currentIndex += 7;
        } else {
          console.log(`❌ EAN-13: Could not decode left digit ${i + 1}`);
          return null;
        }
      }
      
      return digits.join('');
    } catch (error) {
      console.error('Error extracting EAN-13 left digits:', error);
      return null;
    }
  }
  
  /**
   * Extract right digits from EAN-13
   */
  private static extractEAN13RightDigits(widths: number[], startIndex: number): string | null {
    try {
      const digits: string[] = [];
      let currentIndex = startIndex;
      
      for (let i = 0; i < 6; i++) {
        if (currentIndex + 7 > widths.length) break;
        
        const digitPattern = widths.slice(currentIndex, currentIndex + 7);
        const digit = this.decodeEAN13RightDigit(digitPattern);
        
        if (digit !== null) {
          digits.push(digit);
          currentIndex += 7;
        } else {
          console.log(`❌ EAN-13: Could not decode right digit ${i + 1}`);
          return null;
        }
      }
      
      return digits.join('');
    } catch (error) {
      console.error('Error extracting EAN-13 right digits:', error);
      return null;
    }
  }
  
  /**
   * Decode EAN-13 left digit
   */
  private static decodeEAN13LeftDigit(pattern: number[]): string | null {
    if (pattern.length !== 7) return null;
    
    const patternStr = pattern.join('');
    
    for (const [digit, expectedPattern] of Object.entries(this.EAN13_LEFT_PATTERNS)) {
      const expectedStr = expectedPattern.join('');
      if (this.patternMatch(patternStr, expectedStr)) {
        return digit;
      }
    }
    
    return null;
  }
  
  /**
   * Decode EAN-13 right digit
   */
  private static decodeEAN13RightDigit(pattern: number[]): string | null {
    if (pattern.length !== 7) return null;
    
    const patternStr = pattern.join('');
    
    for (const [digit, expectedPattern] of Object.entries(this.EAN13_RIGHT_PATTERNS)) {
      const expectedStr = expectedPattern.join('');
      if (this.patternMatch(patternStr, expectedStr)) {
        return digit;
      }
    }
    
    return null;
  }
  
  /**
   * Decode EAN-8 barcode
   */
  private static decodeEAN8(widths: number[]): string | null {
    try {
      console.log('🔍 Trying EAN-8 decoding...');
      
      if (widths.length < 67) {
        console.log(`❌ EAN-8: Too few modules (${widths.length})`);
        return null;
      }
      
      // Similar to EAN-13 but shorter
      const digits = this.extractEAN8Digits(widths);
      if (digits && digits.length === 7) {
        const checkDigit = this.calculateEAN8CheckDigit(digits);
        const fullBarcode = digits + checkDigit;
        console.log(`✅ EAN-8 decoded: ${fullBarcode}`);
        return fullBarcode;
      }
      
      return null;
    } catch (error) {
      console.error('Error decoding EAN-8:', error);
      return null;
    }
  }
  
  /**
   * Extract EAN-8 digits
   */
  private static extractEAN8Digits(widths: number[]): string | null {
    // Simplified EAN-8 extraction
    const digits: string[] = [];
    
    // Look for start pattern and extract digits
    let startIndex = -1;
    for (let i = 0; i < widths.length - 2; i++) {
      if (widths[i] === 1 && widths[i + 1] === 0 && widths[i + 2] === 1) {
        startIndex = i;
        break;
      }
    }
    
    if (startIndex === -1) return null;
    
    let currentIndex = startIndex + 3;
    
    // Extract 4 left digits
    for (let i = 0; i < 4; i++) {
      if (currentIndex + 7 > widths.length) break;
      const digitPattern = widths.slice(currentIndex, currentIndex + 7);
      const digit = this.decodeEAN13LeftDigit(digitPattern);
      if (digit) {
        digits.push(digit);
        currentIndex += 7;
      } else {
        return null;
      }
    }
    
    // Skip middle pattern
    currentIndex += 5;
    
    // Extract 3 right digits
    for (let i = 0; i < 3; i++) {
      if (currentIndex + 7 > widths.length) break;
      const digitPattern = widths.slice(currentIndex, currentIndex + 7);
      const digit = this.decodeEAN13RightDigit(digitPattern);
      if (digit) {
        digits.push(digit);
        currentIndex += 7;
      } else {
        return null;
      }
    }
    
    return digits.length === 7 ? digits.join('') : null;
  }
  
  /**
   * Decode Code 128 barcode
   */
  private static decodeCode128(widths: number[]): string | null {
    try {
      console.log('🔍 Trying Code 128 decoding...');
      
      if (widths.length < 20) {
        console.log(`❌ Code 128: Too few modules (${widths.length})`);
        return null;
      }
      
      // Look for start pattern
      let startIndex = -1;
      for (let i = 0; i < widths.length - 3; i++) {
        if (widths[i] === 2 && widths[i + 1] === 1 && widths[i + 2] === 1) {
          startIndex = i;
          break;
        }
      }
      
      if (startIndex === -1) {
        console.log('❌ Code 128: Start pattern not found');
        return null;
      }
      
      console.log(`✅ Code 128: Start pattern found at index ${startIndex}`);
      
      // Extract data
      const data = this.extractCode128Data(widths, startIndex + 3);
      if (data) {
        console.log(`✅ Code 128 decoded: ${data}`);
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('Error decoding Code 128:', error);
      return null;
    }
  }
  
  /**
   * Extract Code 128 data
   */
  private static extractCode128Data(widths: number[], startIndex: number): string | null {
    try {
      const data: string[] = [];
      let currentIndex = startIndex;
      
      while (currentIndex < widths.length - 6) {
        if (currentIndex + 6 > widths.length) break;
        
        const charPattern = widths.slice(currentIndex, currentIndex + 6);
        const char = this.decodeCode128Character(charPattern);
        
        if (char) {
          data.push(char);
          currentIndex += 6;
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
    if (pattern.length !== 6) return null;
    
    const patternStr = pattern.join('');
    
    for (const [digit, expectedPattern] of Object.entries(this.CODE128_PATTERNS)) {
      const expectedStr = expectedPattern.join('');
      if (this.patternMatch(patternStr, expectedStr)) {
        return digit;
      }
    }
    
    return null;
  }
  
  /**
   * Decode UPC barcode
   */
  private static decodeUPC(widths: number[]): string | null {
    try {
      console.log('🔍 Trying UPC decoding...');
      
      if (widths.length < 51) {
        console.log(`❌ UPC: Too few modules (${widths.length})`);
        return null;
      }
      
      // Similar to EAN-13 but with different start/end patterns
      const digits = this.extractUPCDigits(widths);
      if (digits && digits.length === 11) {
        const checkDigit = this.calculateUPCACheckDigit(digits);
        const fullBarcode = digits + checkDigit;
        console.log(`✅ UPC decoded: ${fullBarcode}`);
        return fullBarcode;
      }
      
      return null;
    } catch (error) {
      console.error('Error decoding UPC:', error);
      return null;
    }
  }
  
  /**
   * Extract UPC digits
   */
  private static extractUPCDigits(widths: number[]): string | null {
    // Simplified UPC extraction
    const digits: string[] = [];
    
    // Look for start pattern
    let startIndex = -1;
    for (let i = 0; i < widths.length - 2; i++) {
      if (widths[i] === 1 && widths[i + 1] === 0 && widths[i + 2] === 1) {
        startIndex = i;
        break;
      }
    }
    
    if (startIndex === -1) return null;
    
    let currentIndex = startIndex + 3;
    
    // Extract 6 left digits
    for (let i = 0; i < 6; i++) {
      if (currentIndex + 7 > widths.length) break;
      const digitPattern = widths.slice(currentIndex, currentIndex + 7);
      const digit = this.decodeEAN13LeftDigit(digitPattern);
      if (digit) {
        digits.push(digit);
        currentIndex += 7;
      } else {
        return null;
      }
    }
    
    // Skip middle pattern
    currentIndex += 5;
    
    // Extract 5 right digits
    for (let i = 0; i < 5; i++) {
      if (currentIndex + 7 > widths.length) break;
      const digitPattern = widths.slice(currentIndex, currentIndex + 7);
      const digit = this.decodeEAN13RightDigit(digitPattern);
      if (digit) {
        digits.push(digit);
        currentIndex += 7;
      } else {
        return null;
      }
    }
    
    return digits.length === 11 ? digits.join('') : null;
  }
  
  /**
   * Calculate threshold using Otsu's method
   */
  private static calculateThreshold(line: Uint8Array): number {
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
    
    return matches >= pattern1.length * 0.8; // 80% match threshold
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
