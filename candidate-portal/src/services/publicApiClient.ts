/**
 * Placeholder para integração futura com /api/v1/public
 * Não faz chamadas reais nesta fase — todos os dados são mockados.
 */

const BASE_URL = '/api/v1/public';

export const publicApiClient = {
  baseUrl: BASE_URL,

  // Placeholder para implementação futura
  async get<T>(_path: string): Promise<T> {
    throw new Error(
      `publicApiClient não está habilitado nesta fase. Use mockCandidatePortalService. Path: ${_path}`,
    );
  },

  async post<T>(_path: string, _body: unknown): Promise<T> {
    throw new Error(
      `publicApiClient não está habilitado nesta fase. Use mockCandidatePortalService. Path: ${_path}`,
    );
  },
};
