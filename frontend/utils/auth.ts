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
