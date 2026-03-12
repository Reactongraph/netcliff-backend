# Alright! OTT API (alright-api)

This is the **Node.js (Express)** backend API for the Alright! OTT platform. It powers the mobile apps and web frontend, handling user authentication, content management, payments, and subscriptions.

## 🚀 Overview

The API is built using a modular architecture with **Express.js** and **MongoDB**. It serves as the central hub for:
*   **User Management**: Phone login, OTP verification (MSG91), and profile management.
*   **Content Delivery**: Metadata for Movies, Episodes, Seasons, and Banners.
*   **Payments**: Integration with **Razorpay** and **Cashfree** for premium subscriptions.
*   **Analytics**: Event tracking via MoEngage and Adjust.

## 📂 Key Modules

The codebase is structured around functional modules. Below are the key components currently in use:

### 1. **User & Auth (`server/user`)**
*   Handles user registration and login via Phone Number (OTP).
*   Manages user profiles, device sessions, and watchlist/history.
*   Integrates with **Firebase Auth** for secure token management.
*   Syncs user data with **MoEngage** for marketing automation.

### 2. **Subscriptions & Payments**
*   **`server/premiumPlan`**: Manages subscription plans (Basic, Premium, etc.) and their pricing.
*   **`server/razorpayWebHooks`**: Handles webhooks from Razorpay for recurring payments and successful transactions.
*   **`server/cashfreeWebHooks`**: Handles webhooks for Cashfree payment gateways.
*   **`server/experimentalPlan`**: Logic for A/B testing different pricing structures/offers.

### 3. **Content Management & Video**
*   **`server/movie`**: API for fetching movie details, cast, and related content.
*   **`server/episode` & `server/season`**: Manages the hierarchy of TV shows (Show -> Season -> Episodes).
*   **`server/banner`**: deliver dynamic banners for the home screen (sliders, featured content).
*   **`server/recommendation`**: Logic for "Recommended for You" and "Similar Content" lists.
*   **`server/viewedContent`**: Tracks user watch progress (continue watching).
*   **Video Encoding (Mux)**:
    *   **Core Config (`config/mux.js`)**: Initializes Mux clients for standard and DRM-protected streaming.
    *   **`server/models/MuxUpload.js`**: Tracks the lifecycle of video assets (upload -> processing -> ready/error), including playback IDs and duration.

### 4. **CMS & Configuration**
*   **`server/customPage`**: Powers dynamic landing pages with configurable widgets and layouts.
*   **`server/widget`**: reusable UI block definitions for the frontend (sliders, grids, carousels).
*   **`server/ottPlay`**: Integrations specific to third-party OTT aggregators.
*   **`server/brandIntegration`**: APIs for sponsored content and brand partnerships.

### 5. **Core Utilities (`util/`)**
*   Helper functions for:
    *   **MSG91**: Sending and verifying OTPs.
    *   **File Uploads**: Handling image/video assets.
    *   **Notification**: Sending Push Notifications via FCM.

### 6. **Configuration (`config/`)**
*   Database connection settings (MongoDB).
*   Environment variable management.
*   Global constants and keys.

### 7. **Middleware (`server/middleware`)**
*   **Auth Middleware**: Validates JWT tokens and protects private routes.
*   **Admin Middleware**: Ensures only authorized admins can access CMS routes.
*   **Upload Middleware**: Handles multipart file uploads using Multer.

## 🛠️ Tech Stack
*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **Database**: MongoDB (Mongoose ODM)
*   **Authentication**: Firebase Auth & Custom JWT
*   **Payments**: Razorpay, Cashfree
*   **Video Streaming**: Mux (Standard & DRM)
*   **Cloud Storage**: Azure Blob Storage / AWS S3 (via adapters)

---

## 🚀 CI/CD Pipelines

The API uses **GitHub Actions** for automated deployments to Azure App Service.

### Workflows (`.github/workflows/`)

1.  **Production (`master_alright-prod.yml`)**:
    *   **Trigger**: Pushes to the `master` branch.
    *   **Target**: Deploys to the production Azure App Service (`alright-prod`).
    *   **Process**: Installs dependencies, zips the artifact, and uses `azure/webapps-deploy` to update the live server.

2.  **Development (`development_alright-api-v1.yml`)**:
    *   **Trigger**: Pushes to the `development` branch.
    *   **Target**: Deploys to the development/staging environment (`alright-api-v1`).
    *   **Purpose**: Allows testing of new API features before they hit production.

## 💻 Local Development

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Setup**:
    Ensure you have a `.env` file with the connection string for MongoDB and API keys for Razorpay, MSG91, and Firebase.

3.  **Run Server**:
    ```bash
    npm start
    ```
