import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Gets the current authentication token for API requests
 * @returns Promise<string | undefined> - JWT token or undefined if not authenticated
 */
export async function getCurrentSession(): Promise<string | undefined> {
  try {
    const session = await fetchAuthSession();
    return session?.tokens?.idToken?.toString();
  } catch (error) {
    console.error('Failed to get auth session:', error);
    return undefined;
  }
}

/**
 * Gets user information from JWT token
 * @param token - JWT token
 * @returns any - Decoded user information
 */
export function getUserFromToken(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64));
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

/**
 * Gets current user information
 * @returns Promise<any> - User information or null
 */
export async function getCurrentUser(): Promise<any> {
  try {
    const token = await getCurrentSession();
    if (!token) return null;
    return getUserFromToken(token);
  } catch (error) {
    console.error('Failed to get current user:', error);
    return null;
  }
}

/**
 * Gets user email from JWT token
 * @returns Promise<string | null> - User email or null
 */
export async function getUserEmail(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    return user?.email || null;
  } catch (error) {
    console.error('Failed to get user email:', error);
    return null;
  }
}

/**
 * Makes an authenticated API request with proper headers
 * @param url - API endpoint URL
 * @param options - Fetch options (method, body, etc.)
 * @returns Promise<Response> - Fetch response
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getCurrentSession();
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Makes an authenticated GET request
 * @param url - API endpoint URL
 * @returns Promise<Response> - Fetch response
 */
export async function get(url: string): Promise<Response> {
  return authenticatedFetch(url, { method: 'GET' });
}

/**
 * Makes an authenticated POST request
 * @param url - API endpoint URL
 * @param data - Request body data
 * @returns Promise<Response> - Fetch response
 */
export async function post(url: string, data?: any): Promise<Response> {
  return authenticatedFetch(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Makes an authenticated DELETE request
 * @param url - API endpoint URL
 * @returns Promise<Response> - Fetch response
 */
export async function del(url: string): Promise<Response> {
  return authenticatedFetch(url, { method: 'DELETE' });
}

/**
 * Handles API response and throws errors for non-2xx responses
 * @param response - Fetch response
 * @returns Promise<any> - Parsed JSON data
 */
export async function handleApiResponse(response: Response): Promise<any> {
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
