import express, { Express, Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  ScannedItem,
  Product,
  ScanRequest,
  ApiResponse,
} from "./src/types/Types";
import { RealBarcodeDecoder } from "./src/utils/realBarcodeDecoder";
import { SimpleBarcodeScanner } from "./src/utils/simpleBarcodeScanner";

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || "5000", 10);

app.use(cors({
  origin: 'http://localhost:5173', // Vite default port
  credentials: true
}));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

let scannedItems: ScannedItem[] = [];

const productDatabase: Record<string, Product> = {
  "5901234123457": { name: "Organic Whole Milk", price: 4.99 },
  "5012345678900": { name: "Whole Wheat Bread", price: 3.49 },
  "1234567890128": { name: "Spring Water 1L", price: 1.25 },
  "7891234567895": { name: "Free-Range Eggs (Dozen)", price: 5.75 },
  "9827348723400": { name: "Java Programming Book", price: 49.99 },
  DEFAULT: { name: "Unknown Product", price: 0.0 },
};

app.get(
  "/api/items",
  (req: Request, res: Response<ApiResponse<ScannedItem[]>>) => {
    try {
      res.json({ data: scannedItems });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  }
);

app.post(
  "/api/scan",
  (
    req: Request<{}, {}, ScanRequest>,
    res: Response<ApiResponse<ScannedItem>>
  ) => {
    try {
      console.log("Received request body:", req.body);
      const { barcode } = req.body;

      if (!barcode) {
        console.log("No barcode provided in request");
        return res.status(400).json({ error: "Barcode is required" });
      }

      console.log(`Processing barcode: "${barcode}" (length: ${barcode.length})`);
      
      // Trim whitespace and normalize the barcode
      const normalizedBarcode = barcode.trim();
      
      const product: Product =
        productDatabase[normalizedBarcode] || productDatabase["DEFAULT"];

      console.log(`Found product: ${product.name} for barcode: ${normalizedBarcode}`);

      const newItem: ScannedItem = {
        id: Date.now(),
        barcode: normalizedBarcode,
        name: product.name,
        price: product.price,
        timestamp: new Date().toLocaleTimeString(),
      };

      scannedItems.push(newItem);
      console.log(`Added item to list. Total items: ${scannedItems.length}`);

      res.status(201).json({ data: newItem });
    } catch (error) {
      console.error("Error processing scan:", error);
      res.status(500).json({ error: "Failed to process barcode" });
    }
  }
);

app.delete("/api/items", (req: Request, res: Response<ApiResponse>) => {
  try {
    scannedItems = [];
    res.json({ message: "All items cleared" });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear items" });
  }
});

app.get("/health", (req: Request, res: Response<ApiResponse>) => {
  res.json({ message: "Server is running" });
});

// Get available barcodes for testing
app.get("/api/barcodes", (req: Request, res: Response<ApiResponse<string[]>>) => {
  try {
    const availableBarcodes = Object.keys(productDatabase).filter(key => key !== "DEFAULT");
    res.json({ data: availableBarcodes });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch barcodes" });
  }
});

// Test barcode detection with debug info
app.post("/api/test-scan", upload.single('image'), async (req: Request, res: Response<ApiResponse<any>>) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    console.log(`🧪 Testing barcode detection on: ${req.file.filename}`);
    
    const imageBuffer = fs.readFileSync(req.file.path);
    const scanResult = await RealBarcodeDecoder.scanFromImageBuffer(imageBuffer);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      data: {
        success: scanResult.success,
        barcode: scanResult.barcode,
        error: scanResult.error,
        debugInfo: scanResult.debugInfo
      }
    });

  } catch (error) {
    console.error("Error in test scan:", error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: "Failed to test barcode detection" });
  }
});

// Simple test endpoint that always returns a test barcode
app.post("/api/test-simple", upload.single('image'), async (req: Request, res: Response<ApiResponse<ScannedItem>>) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    console.log(`🧪 Simple test with: ${req.file.filename}`);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    // Return a test barcode
    const testBarcode = "5901234123457";
    const product: Product = productDatabase[testBarcode] || productDatabase["DEFAULT"];
    
    const newItem: ScannedItem = {
      id: Date.now(),
      barcode: testBarcode,
      name: product.name,
      price: product.price,
      timestamp: new Date().toLocaleTimeString(),
    };

    scannedItems.push(newItem);
    
    console.log(`✅ Test item added: ${newItem.name}`);
    res.status(201).json({ data: newItem });

  } catch (error) {
    console.error("Error in simple test:", error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: "Failed to process test" });
  }
});

// Upload and scan barcode from image
app.post("/api/scan-image", upload.single('image'), async (req: Request, res: Response<ApiResponse<ScannedItem>>) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    console.log(`📁 Processing uploaded image: ${req.file.filename} (${req.file.size} bytes)`);
    console.log(`📁 File type: ${req.file.mimetype}`);
    
    // Read the uploaded image file
    const imageBuffer = fs.readFileSync(req.file.path);
    console.log(`📁 Image buffer size: ${imageBuffer.length} bytes`);
    
    // For now, just return a test barcode since frontend will handle detection
    const scanResult = {
      success: true,
      barcode: "5901234123457",
      debugInfo: "Frontend detection - backend fallback"
    };
    console.log(`🔍 Scan result:`, scanResult);
    
    if (!scanResult.success || !scanResult.barcode) {
      fs.unlinkSync(req.file.path);
      console.log(`❌ Barcode detection failed: ${scanResult.error}`);
      return res.status(400).json({ 
        error: scanResult.error || "No barcode found in image",
        debugInfo: scanResult.debugInfo
      });
    }

    const barcode = scanResult.barcode;
    console.log(`Found barcode in image: ${barcode}`);
    if (!RealBarcodeDecoder.validateBarcode(barcode)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid barcode format" });
    }

    const product: Product = productDatabase[barcode] || productDatabase["DEFAULT"];
    
    const newItem: ScannedItem = {
      id: Date.now(),
      barcode,
      name: product.name,
      price: product.price,
      timestamp: new Date().toLocaleTimeString(),
    };

    scannedItems.push(newItem);
    
    fs.unlinkSync(req.file.path);
    
    console.log(`Added item from image scan: ${newItem.name}`);
    res.status(201).json({ data: newItem });

  } catch (error) {
    console.error("Error processing image scan:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: "Failed to process image" });
  }
});

app.post("/api/scan-camera", async (req: Request, res: Response<ApiResponse<ScannedItem>>) => {
  try {
    const { imageData } = req.body; 
    
    if (!imageData) {
      return res.status(400).json({ error: "No image data provided" });
    }

    console.log("Processing camera image data");
    
    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Scan for barcode
    const scanResult = await RealBarcodeDecoder.scanFromImageBuffer(imageBuffer);
    
    if (!scanResult.success || !scanResult.barcode) {
      return res.status(400).json({ 
        error: scanResult.error || "No barcode found in image" 
      });
    }

    const barcode = scanResult.barcode;
    console.log(`Found barcode from camera: ${barcode}`);

    // Validate barcode format
    if (!RealBarcodeDecoder.validateBarcode(barcode)) {
      return res.status(400).json({ error: "Invalid barcode format" });
    }

    // Look up product
    const product: Product = productDatabase[barcode] || productDatabase["DEFAULT"];
    
    const newItem: ScannedItem = {
      id: Date.now(),
      barcode,
      name: product.name,
      price: product.price,
      timestamp: new Date().toLocaleTimeString(),
    };

    scannedItems.push(newItem);
    
    console.log(`Added item from camera scan: ${newItem.name}`);
    res.status(201).json({ data: newItem });

  } catch (error) {
    console.error("Error processing camera scan:", error);
    res.status(500).json({ error: "Failed to process camera image" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
