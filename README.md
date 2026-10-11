# Mahajan Facilities — Daily Cleaning Report Generator

A professional, mobile-first web application designed for housekeeping managers at **Mahajan Facilities** to document daily inspections, capture site photos floor-by-floor, and generate client-ready executive A4 PDF reports directly from a mobile phone or computer.

---

## 🌟 Key Features

1. **Corporate Design Theme**:
   - Polished Navy Blue (`#0f2b48`), Crisp White (`#ffffff`), and Slate Light Grey (`#e2e8f0`) theme.
   - Clean executive dashboard with live photo counters, floor documentation progress bars, and quick-jump floor navigation.

2. **13 Building Floors (Strict Ascending Order)**:
   - Ground Floor, 1st Floor, 2nd Floor, 3rd Floor, 4th Floor, 5th Floor, 6th Floor, 7th Floor, 8th Floor, 9th Floor, 10th Floor, 11th Floor, and 12th Floor.

3. **Two Dedicated Photo Sections per Floor**:
   - **Section A: General Cleaning Photos** (Max 20 photos)
   - **Section B: Washroom Cleaning Photos** (Max 20 photos)
   - Total building capacity: **520 photos**.
   - Photo formats: JPG, JPEG, PNG, WEBP.
   - Supports multiple simultaneous uploads and direct mobile camera capture (`capture="environment"`).
   - Real-time photo preview thumbnails with sequential labeling (`#01`, `#02`, ...), click-to-zoom lightbox, and individual remove buttons.
   - Strict 20-photo validation per section with friendly alerts.

4. **Offline Draft Auto-Save (IndexedDB)**:
   - Automatically saves report date and all uploaded photos to local browser storage (`IndexedDB`).
   - If the Android phone screen turns off, browser reloads, or connectivity drops, no photos are lost.
   - Manager can resume work anytime or tap **Clear All Photos** with confirmation.

5. **Professional Executive A4 PDF Generation**:
   - **Cover Page**:
     - Navy blue executive banner with `MAHAJAN FACILITIES` branding.
     - Document title: `DAILY HOUSEKEEPING CLEANING REPORT`.
     - Report Date: Formatted as `DD-MM-YYYY`.
     - Building coverage: Ground Floor to 12th Floor (13 Levels).
     - KPI Summary badges (Total General Photos, Total Washroom Photos, Grand Total Photos).
     - Complete 13-floor breakdown table with per-floor counts and grand totals.
     - Official inspection verification notice.
   - **Floor-by-Floor Pages**:
     - 13 distinct floor sections in ascending order.
     - Section A (General Cleaning) & Section B (Washroom Cleaning) clearly labeled with colored badges.
     - **2 Photos per row** photo-grid layout on A4 portrait pages with preserved aspect ratios (no stretching or distortion).
     - Thin light-grey border around each photo with sequential captions (`Photo 01`, `Photo 02`, ...).
     - Automatic multi-page pagination with continuation headers (never cuts photos across page edges).
     - Displays *"No photos uploaded for this section"* for empty sections (no fake data).
   - **Page Footer on Every Page**:
     - Left: `Mahajan Facilities | Daily Housekeeping Cleaning Report`
     - Center: `Report Date: DD-MM-YYYY`
     - Right: `Page X of Y` (with 100% accurate total page calculation).
   - **Filename**:
     - `Mahajan_Facilities_Daily_Cleaning_Report_DD-MM-YYYY.pdf`

---

## 🚀 How to Run the Application

### 1. Requirements
- Node.js (v18 or higher)
- Modern web browser (Chrome, Samsung Internet, Edge, Safari, Firefox)

### 2. Start the Development Server
In your terminal, navigate to the project directory:
```bash
npm run dev
```

The server starts with `--host` enabled:
- **Local (Computer)**: `http://localhost:5173/`
- **Network (Mobile Devices)**: `http://<YOUR-COMPUTER-IP>:5173/` (e.g. `http://192.168.1.5:5173/`)

---

## 📱 How to Use on an Android Mobile Phone

Housekeeping managers will primarily use this on their Android mobile phones during inspection rounds:

1. **Connect to the Same Wi-Fi Network**:
   - Connect the Android phone to the same Wi-Fi network as the host computer.
2. **Open the Mobile Browser**:
   - On the Android phone, open Chrome or Samsung Internet.
   - Enter the Network URL shown in the terminal (e.g., `http://192.168.1.5:5173/`).
3. **Field Workflow for the Manager**:
   - **Step 1**: Check the **Report Date** at the top (defaults to today's date).
   - **Step 2**: Use the **Floor Navigation pills** to quickly jump to the floor being inspected (e.g., Ground Floor).
   - **Step 3**:
     - Tap **Camera** to snap cleaning photos live with the phone camera.
     - Or tap **Select Photos** to upload multiple photos at once from the phone's gallery.
     - Upload up to 20 photos for **General Cleaning** and up to 20 photos for **Washroom Cleaning**.
   - **Step 4**: Repeat for other floors as needed.
   - **Step 5**: Tap **Generate Daily PDF** on the sticky bottom bar.
   - **Step 6**: The PDF will compile instantly. Tap **Download PDF** to save the file:
     `Mahajan_Facilities_Daily_Cleaning_Report_DD-MM-YYYY.pdf`.
   - **Step 7**: The manager can now share the downloaded PDF with the building manager or client directly via **WhatsApp** or **Email**!

---

## 📦 Production Build

To create an optimized production bundle:
```bash
npm run build
```
The output files will be in the `dist/` directory, ready to deploy to any web host (such as Vercel, Netlify, Cloudflare Pages, or an internal server).
