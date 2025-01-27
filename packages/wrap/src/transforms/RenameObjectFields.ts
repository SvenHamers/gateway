import {
  DelegationContext,
  SubschemaConfig,
  Transform,
} from '@graphql-tools/delegate';
import { ExecutionRequest } from '@graphql-tools/utils';
import { GraphQLFieldConfig, GraphQLSchema } from 'graphql';
import TransformObjectFields from './TransformObjectFields.js';

interface RenameObjectFieldsTransformationContext extends Record<string, any> {}

export default class RenameObjectFields<TContext = Record<string, any>>
  implements Transform<RenameObjectFieldsTransformationContext, TContext>
{
  private readonly transformer: TransformObjectFields<TContext>;

  constructor(
    renamer: (
      typeName: string,
      fieldName: string,
      fieldConfig: GraphQLFieldConfig<any, any>,
    ) => string,
  ) {
    this.transformer = new TransformObjectFields(
      (
        typeName: string,
        fieldName: string,
        fieldConfig: GraphQLFieldConfig<any, any>,
      ) => [renamer(typeName, fieldName, fieldConfig), fieldConfig],
    );
  }

  public transformSchema(
    originalWrappingSchema: GraphQLSchema,
    subschemaConfig: SubschemaConfig<any, any, any, TContext>,
  ): GraphQLSchema {
    return this.transformer.transformSchema(
      originalWrappingSchema,
      subschemaConfig,
    );
  }

  public transformRequest(
    originalRequest: ExecutionRequest,
    delegationContext: DelegationContext<TContext>,
    transformationContext: RenameObjectFieldsTransformationContext,
  ): ExecutionRequest {
    return this.transformer.transformRequest(
      originalRequest,
      delegationContext,
      transformationContext,
    );
  }
}
