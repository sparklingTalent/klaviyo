# Klaviyo Metrics Dashboard

A full-stack application for managing and viewing Klaviyo metrics dashboards for multiple clients.

## Features

- **Client Management**: Admin can manually add clients with their Klaviyo credentials
- **Client Authentication**: Secure login system for clients
- **Comprehensive Metrics Dashboard**: View all Klaviyo metrics including:
  - Campaign Metrics (Opens, CTR, Delivered, Bounces, Revenue)
  - Flow Metrics (Conversion Rate, Sends, Revenue)
  - Event Metrics (Placed Order, Viewed Product, Added to Cart, Active on Site)
  - Profile Metrics (Total Profiles, List Membership, List Growth)
  - Revenue Metrics (Total Revenue, Revenue by Source, Revenue Over Time)

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: SQLite (can be easily migrated to PostgreSQL for Railway)
- **Deployment**: 
  - Frontend: Vercel
  - Backend: Railway

## Project Structure

```
Klaviyo_Metrics/
├── backend/
│   ├── db/
│   │   └── database.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── admin.js
│   │   └── metrics.js
│   ├── services/
│   │   └── klaviyo.js
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.jsx
│   ├── index.html
│   └── package.json
└── README.md
```

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```
PORT=3001
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

5. Start the server:
```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (optional, defaults to localhost):
```bash
cp .env.example .env
```

4. Update `.env` with your API URL:
```
VITE_API_URL=http://localhost:3001/api
```

5. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Client login

### Admin (No auth required for simplicity - add in production)
- `POST /api/admin/clients` - Add a new client
  ```json
  {
    "name": "Client Name",
    "email": "client@example.com",
    "password": "password123",
    "klaviyo_private_key": "pk_xxxxx"
  }
  ```
- `GET /api/admin/clients` - Get all clients

### Metrics (Requires authentication)
- `GET /api/metrics/all` - Get all metrics
- `GET /api/metrics/:category` - Get specific category (campaign, flow, event, profile, revenue)

## Adding a Client

### Method 1: Using the Admin Panel (Recommended)

1. Navigate to the admin panel in your browser:
   - Local: `http://localhost:3000/admin`
   - Production: `https://your-vercel-app.vercel.app/admin`

2. Fill in the form with:
   - Client Name
   - Email
   - Password
   - Klaviyo Private Key

3. Click "Add Client"

The admin panel also displays all existing clients.

### Method 2: Using the API Endpoint

Make a POST request to `/api/admin/clients`:

```bash
curl -X POST http://localhost:3001/api/admin/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepassword",
    "klaviyo_private_key": "pk_your_klaviyo_private_key"
  }'
```

### Method 2: Using the Script

You can also use the provided script:

```bash
cd backend
node scripts/add-client.js "John Doe" "john@example.com" "securepassword" "pk_your_klaviyo_private_key"
```

## Deployment

### Frontend to Vercel

**Option 1: Using Vercel Dashboard (Recommended)**

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your Git repository
4. Set the **Root Directory** to `frontend`
5. Set the **Framework Preset** to Vite
6. Add environment variable:
   - `VITE_API_URL` = Your Railway backend URL (e.g., `https://your-app.railway.app/api`)
7. Click "Deploy"

**Option 2: Using Vercel CLI**

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Navigate to frontend directory:
```bash
cd frontend
```

3. Deploy:
```bash
vercel
```

4. Set environment variable `VITE_API_URL` to your Railway backend URL in Vercel dashboard

### Backend to Railway

**Option 1: Using Railway Dashboard (Recommended)**

1. Go to [railway.app](https://railway.app) and sign in
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. In project settings, set the **Root Directory** to `backend`
5. Add environment variables:
   - `JWT_SECRET` = Your secret key (generate a strong random string)
   - `NODE_ENV` = `production`
   - `PORT` will be set automatically by Railway
6. Railway will automatically detect Node.js and deploy

**Option 2: Using Railway CLI**

1. Install Railway CLI:
```bash
npm i -g @railway/cli
```

2. Navigate to backend directory:
```bash
cd backend
```

3. Login to Railway:
```bash
railway login
```

4. Initialize project:
```bash
railway init
```

5. Link to existing project or create new one:
```bash
railway link
```

6. Add environment variables:
```bash
railway variables set JWT_SECRET=your-secret-key
railway variables set NODE_ENV=production
```

7. Deploy:
```bash
railway up
```

**Note**: For production, consider migrating from SQLite to PostgreSQL. Railway provides PostgreSQL databases that you can easily connect to.

## Klaviyo API Notes

The application uses Klaviyo API v3 with the `Klaviyo-API-Key` authentication header. The API endpoints and data structures may vary depending on your Klaviyo account setup and API version. If you encounter issues fetching metrics:

1. Verify your Klaviyo private key is correct and has the necessary permissions
2. Check the Klaviyo API documentation for the latest endpoint structures: https://developers.klaviyo.com/
3. The service is designed to gracefully handle API errors and return default values if metrics cannot be fetched
4. You may need to adjust the endpoint paths in `backend/services/klaviyo.js` based on your specific Klaviyo API version

## Security Notes

- In production, add authentication middleware to admin routes
- Use environment variables for all secrets
- Consider implementing rate limiting
- Use HTTPS in production
- Validate and sanitize all inputs
- Store Klaviyo private keys securely (consider encryption at rest)

## Troubleshooting

### Backend Issues
- Ensure SQLite database file has write permissions
- Check that all environment variables are set correctly
- Verify Klaviyo API key format and permissions

### Frontend Issues
- Ensure the `VITE_API_URL` environment variable points to your backend
- Check browser console for CORS errors (backend should handle CORS)
- Verify authentication token is being stored in localStorage

### Klaviyo API Issues
- Check Klaviyo API key is valid and has required scopes
- Verify API endpoints match your Klaviyo account version
- Review server logs for detailed error messages

## License

MIT

