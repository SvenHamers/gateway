import { mapMaybePromise } from '@envelop/core';
import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import type { OnFetchHookDone } from '@graphql-mesh/types';
import type { GatewayPlugin } from '../types';

interface FromClientToSubgraphsPayload {
  request: Request;
  subgraphName: string;
}

interface FromSubgraphsToClientPayload {
  response: Response;
  subgraphName: string;
}

export interface PropagateHeadersOpts {
  fromClientToSubgraphs?: (
    payload: FromClientToSubgraphsPayload,
  ) =>
    | Record<string, string>
    | void
    | Promise<Record<string, string | null | undefined> | void>;
  fromSubgraphsToClient?: (
    payload: FromSubgraphsToClientPayload,
  ) =>
    | Record<string, string>
    | void
    | Promise<Record<string, string | null | undefined> | void>;
}

export function usePropagateHeaders<TContext extends Record<string, any>>(
  opts: PropagateHeadersOpts,
): GatewayPlugin<TContext> {
  const resHeadersByRequest = new WeakMap<
    Request,
    Record<string, string | null | undefined>
  >();
  return {
    onFetch({ executionRequest, context, options, setOptions }) {
      const request = context?.request || executionRequest?.context?.request;
      if (request) {
        const subgraphName = (executionRequest &&
          subgraphNameByExecutionRequest.get(executionRequest))!;
        let job!: Promise<void> | void;
        if (opts.fromClientToSubgraphs) {
          job = mapMaybePromise(
            opts.fromClientToSubgraphs({
              request,
              subgraphName,
            }),
            (headers) =>
              setOptions({
                ...options,
                // @ts-expect-error TODO: headers can contain null and undefined values. the types are incorrect
                headers: {
                  ...headers,
                  ...options.headers,
                },
              }),
          );
        }
        return mapMaybePromise(job, (): OnFetchHookDone | void => {
          if (opts.fromSubgraphsToClient) {
            return function onFetchDone({ response }) {
              return mapMaybePromise(
                opts.fromSubgraphsToClient?.({
                  response,
                  subgraphName,
                }),
                (headers) => {
                  if (headers && request) {
                    resHeadersByRequest.set(request, headers);
                  }
                },
              );
            };
          }
        });
      }
    },
    onResponse({ response, request }) {
      const headers = resHeadersByRequest.get(request);
      if (headers) {
        for (const key in headers) {
          const value = headers[key];
          if (value) {
            response.headers.set(key, value);
          }
        }
      }
    },
  };
}