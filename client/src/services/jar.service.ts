import { API_BASE_URL } from '@/config';
import { http } from './http';

const JAR_ENDPOINT = `${API_BASE_URL}/api/jar/process`;

export async function processJar(request: string, clientId: string): Promise<any> {
  return http.postJson(JAR_ENDPOINT, { request, clientId });
}
