import { setTimeout } from 'timers/promises';
import { Response } from '@whatwg-node/fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSupergraphSdlFromManagedFederation,
  SupergraphSchemaManager,
} from '../src/managed-federation';
import { getSupergraph } from './fixtures/gateway/supergraph';

describe('Managed Federation', () => {
  vi.useFakeTimers?.();
  const advanceTimersByTimeAsync = vi.advanceTimersByTimeAsync || setTimeout;
  let supergraphSdl: string;
  const mockSDL = vi.fn(async () =>
    Response.json({
      data: {
        routerConfig: {
          __typename: 'RouterConfigResult',
          minDelaySeconds: 0.1,
          id: 'test-id-1',
          supergraphSdl,
          messages: [],
        },
      },
    }),
  );

  const mockUnchanged = vi.fn(async () =>
    Response.json({
      data: {
        routerConfig: {
          __typename: 'Unchanged',
          minDelaySeconds: 0.1,
          id: 'test-id-1',
        },
      },
    }),
  );

  const mockFetchError = vi.fn(async () =>
    Response.json({
      data: {
        routerConfig: {
          __typename: 'FetchError',
          code: 'FETCH_ERROR',
          message: 'Test error message',
          minDelaySeconds: 0.1,
        },
      },
    }),
  );

  const mockError = vi.fn(async () => {
    throw new Error('Test Error');
  });

  beforeEach(async () => {
    supergraphSdl ||= await getSupergraph();
    vi.clearAllMocks();
  });

  describe('Supergraph SDL Fetcher', () => {
    // Skipped for the CI, you can run it locally to verify it actually works against GraphOS API
    it.skip('should fetch the supergraph SDL from GraphOS', async () => {
      const result = await fetchSupergraphSdlFromManagedFederation();
      expect(result).toMatchObject({
        supergraphSdl: expect.any(String),
        id: expect.any(String),
        minDelaySeconds: expect.any(Number),
      });
    });

    it('should pass the variables correctly to the fetch function', async () => {
      await fetchSupergraphSdlFromManagedFederation({
        apiKey: 'test-api-key',
        graphRef: 'test-graph-id',
        lastSeenId: 'test-last-seen-id',
        upLink: 'test-up-link',
        fetch(url, bodyInit) {
          expect(url).toBe('test-up-link');
          expect(bodyInit?.body).toContain('"lastSeenId":"test-last-seen-id"');
          expect(bodyInit?.body).toContain('"graphRef":"test-graph-id"');
          expect(bodyInit?.body).toContain('"apiKey":"test-api-key"');
          return mockSDL();
        },
      });

      expect.assertions(4);
    });

    it('should load API key and Graph Ref from env', async () => {
      process.env['APOLLO_KEY'] = 'test-api-key';
      process.env['APOLLO_GRAPH_REF'] = 'test-graph-id';
      process.env['APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT'] =
        'test-up-link1,test-up-link2';
      await fetchSupergraphSdlFromManagedFederation({
        fetch(url, bodyInit) {
          expect(url).toBe('test-up-link1');
          expect(bodyInit?.body).toContain('"graphRef":"test-graph-id"');
          expect(bodyInit?.body).toContain('"apiKey":"test-api-key"');
          return mockSDL();
        },
      });

      expect.assertions(3);
    });

    it('should handle unchanged supergraph SDL', async () => {
      const result = await fetchSupergraphSdlFromManagedFederation({
        fetch: mockUnchanged,
      });

      expect(result).toMatchObject({
        id: 'test-id-1',
        minDelaySeconds: 0.1,
      });
    });

    it('should handle fetch errors returned by GraphOS', async () => {
      const result = await fetchSupergraphSdlFromManagedFederation({
        apiKey: 'service:fake-key',
        graphRef: 'test-id-1',
        fetch: mockFetchError,
      });

      expect(result).toMatchObject({
        minDelaySeconds: 0.1,
        error: { code: 'FETCH_ERROR', message: 'Test error message' },
      });
    });

    it('should return the supergraph SDL with metadata', async () => {
      const result = await fetchSupergraphSdlFromManagedFederation({
        fetch: mockSDL,
      });

      expect(result).toMatchObject({
        supergraphSdl,
        id: 'test-id-1',
        minDelaySeconds: 0.1,
      });
    });

    it('should throw an error if the fetch fails', async () => {
      await expect(
        fetchSupergraphSdlFromManagedFederation({
          fetch: mockError,
        }),
      ).rejects.toThrow('Test Error');
    });
  });

  describe('Supergraph Schema Manager', () => {
    let manager: SupergraphSchemaManager;
    afterEach(() => {
      manager?.stop();
    });

    it('should allow to wait for initial schema load', async () => {
      manager = new SupergraphSchemaManager({
        fetch: mockSDL,
      });

      manager.start();

      const schema$ = new Promise((resolve) => manager.once('schema', resolve));

      await advanceTimersByTimeAsync(50);

      await schema$;

      expect(manager.schema).toBeDefined();
    });

    it('should call onFailure when failed more than the given max retries', async () => {
      manager = new SupergraphSchemaManager({
        fetch: mockFetchError,
        maxRetries: 3,
      });

      const onFailure = vi.fn();
      manager.on('failure', onFailure);
      const onError = vi.fn();
      manager.on('error', onError);
      manager.start();

      await advanceTimersByTimeAsync(250);
      expect(mockFetchError).toHaveBeenCalledTimes(3);
      expect(onError).toHaveBeenCalledTimes(3);
      expect(onFailure).toHaveBeenCalledTimes(1);
    });

    it('should call onSchemaChange on each new schema', async () => {
      manager = new SupergraphSchemaManager({
        fetch: mockSDL,
      });

      const onSchemaChange = vi.fn();
      manager.on('schema', onSchemaChange);
      manager.start();

      await advanceTimersByTimeAsync(290);
      expect(onSchemaChange).toHaveBeenCalledTimes(3);
    });

    it('should call onSchemaChange for on and once listeners', async () => {
      manager = new SupergraphSchemaManager({
        fetch: mockSDL,
      });

      const onSchemaChange = vi.fn();
      manager.once('schema', onSchemaChange);
      manager.on('schema', onSchemaChange);
      manager.start();

      await advanceTimersByTimeAsync(50);
      expect(onSchemaChange).toHaveBeenCalledTimes(2);
    });

    it('should retry on exceptions', async () => {
      manager = new SupergraphSchemaManager({
        fetch: mockError,
        maxRetries: 3,
      });

      const onFailure = vi.fn();
      manager.on('failure', onFailure);
      const onError = vi.fn();
      manager.on('error', onError);
      manager.start();

      await advanceTimersByTimeAsync(50);
      expect(onError).toHaveBeenCalledTimes(3);
      expect(mockError).toHaveBeenCalledTimes(3);
      expect(onFailure).toHaveBeenCalledTimes(1);
    });

    it('should emit uplink messages', async () => {
      manager = new SupergraphSchemaManager({
        fetch: async () =>
          Response.json({
            data: {
              routerConfig: {
                __typename: 'RouterConfigResult',
                supergraphSdl,
                id: 'test-id',
                minDelaySeconds: 10,
                messages: [{ level: 'INFO', body: 'test-message' }],
              },
            },
          }),
      });

      const onMessage = vi.fn();
      manager.on('log', onMessage);
      manager.start();

      await advanceTimersByTimeAsync(50);
      expect(onMessage).toHaveBeenCalledWith({
        message: 'test-message',
        level: 'info',
        source: 'uplink',
      });
    });
  });
});
