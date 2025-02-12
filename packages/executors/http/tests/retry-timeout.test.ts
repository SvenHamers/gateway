import { Server } from 'http';
import { AddressInfo, Socket } from 'net';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { Response } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHTTPExecutor } from '../src';

describe('Retry & Timeout', () => {
  let server: Server;
  const sockets = new Set<Socket>();
  afterEach(() => {
    sockets.forEach((socket) => {
      socket.destroy();
    });
    server?.close();
  });
  describe('retry', () => {
    it('retry in an HTTP error', async () => {
      let cnt = 0;
      const executor = buildHTTPExecutor({
        async fetch() {
          if (cnt < 2) {
            cnt++;
            return Response.error();
          }
          return Response.json({ data: { hello: 'world' } });
        },
        retry: 3,
      });
      const result = await executor({
        document: parse(/* GraphQL */ `
          query {
            hello
          }
        `),
      });
      expect(result).toMatchObject({
        data: {
          hello: 'world',
        },
      });
      expect(cnt).toEqual(2);
    });
    it('retry in GraphQL Error', async () => {
      let cnt = 0;
      const executor = buildHTTPExecutor({
        async fetch() {
          if (cnt < 2) {
            cnt++;
            return Response.json({
              errors: [{ message: `error in ${cnt}` }],
            });
          }
          return Response.json({ data: { hello: 'world' } });
        },
        retry: 3,
      });
      const result = await executor({
        document: parse(/* GraphQL */ `
          query {
            hello
          }
        `),
      });
      expect(result).toMatchObject({
        data: {
          hello: 'world',
        },
      });
      expect(cnt).toEqual(2);
    });
    it('retry and fail with the last error', async () => {
      let cnt = 0;
      const executor = buildHTTPExecutor({
        async fetch() {
          cnt++;
          return Response.json({
            errors: [{ message: `error in ${cnt}` }],
          });
        },
        retry: 3,
      });
      const result = await executor({
        document: parse(/* GraphQL */ `
          query {
            hello
          }
        `),
      });
      expect(result).toMatchObject({
        errors: [{ message: `error in 3` }],
      });
      expect(cnt).toEqual(3);
    });
  });
  it('timeout', async () => {
    server = new Server();
    server.listen(0);
    const executor = buildHTTPExecutor({
      endpoint: `http://localhost:${(server.address() as AddressInfo).port}`,
      timeout: 500,
    });
    const result = await executor({
      document: parse(/* GraphQL */ `
        query {
          hello
        }
      `),
    });
    expect(result).toMatchObject({
      errors: [
        {
          message: expect.stringMatching(/timeout|(timed out)|(time out)/),
        },
      ],
    });
  });
  it('retry & timeout', async () => {
    let cnt = 0;
    server = new Server((_, res) => {
      if (cnt < 2) {
        cnt++;
      } else {
        res.end(JSON.stringify({ data: { hello: 'world' } }));
      }
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => {
        sockets.delete(socket);
      });
    });
    server.listen(0);
    const executor = buildHTTPExecutor({
      endpoint: `http://localhost:${(server.address() as AddressInfo).port}`,
      timeout: 500,
      retry: 3,
    });
    const result = await executor({
      document: parse(/* GraphQL */ `
        query {
          hello
        }
      `),
    });
    expect(result).toMatchObject({
      data: {
        hello: 'world',
      },
    });
    expect(cnt).toEqual(2);
    await (executor as any)[DisposableSymbols.asyncDispose]?.();
  });
});
