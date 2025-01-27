import type { MeshFetch } from '@graphql-mesh/types';
import { buildSchema, parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import httpTransport from '../src';

describe('HTTP Transport', () => {
  const subgraphName = 'test';
  it('interpolate the strings in headers', async () => {
    const fetch = vi.fn<MeshFetch>(async () =>
      Response.json({
        data: {
          test: 'test',
        },
      }),
    );
    const expectedToken = 'wowmuchsecret';
    const executor = httpTransport.getSubgraphExecutor({
      subgraphName,
      transportEntry: {
        kind: 'http',
        subgraph: subgraphName,
        headers: [['x-test', '{context.myToken}']],
      },
      fetch,
      // @ts-expect-error - transport kind is const in httpTransport but string is expected
      transportExecutorFactoryGetter: () => httpTransport.getSubgraphExecutor,
      subgraph: buildSchema(/* GraphQL */ `
        type Query {
          test: String
        }
      `),
    });
    await executor({
      document: parse(/* GraphQL */ `
        query {
          test
        }
      `),
      context: {
        myToken: expectedToken,
      },
    });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        'x-test': expectedToken,
      },
    });
  });
});
