# Frontend
cd frontend
npm run dev
NEXT_PUBLIC_API_URL=http://localhost:3001 \
NEXT_PUBLIC_USER_POOL_ID=your_local_pool_id \
NEXT_PUBLIC_USER_POOL_CLIENT_ID=your_local_client_id


# Backend Local
node services/local-api.ts

