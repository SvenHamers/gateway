import {
  getDirectiveExtensions,
  MapperKind,
  mapSchema,
  type DirectableGraphQLObject,
} from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import { isNamedType } from 'graphql';

function isHidden(directableObj: DirectableGraphQLObject) {
  const directiveExtensions = getDirectiveExtensions(directableObj);
  const hiddenDirectives = directiveExtensions?.['hidden'];
  return hiddenDirectives?.length;
}

export function filterHiddenPartsInSchema(schema: GraphQLSchema) {
  return mapSchema(schema, {
    [MapperKind.TYPE](type) {
      if (isNamedType(type) && isHidden(type)) {
        return null;
      }
      return undefined;
    },
    [MapperKind.ROOT_OBJECT](type) {
      const fields = Object.values(type.getFields());
      const availableFields = fields.filter((field) => !isHidden(field));
      if (!availableFields.length) {
        return null;
      }
      return undefined;
    },
    [MapperKind.ROOT_FIELD](fieldConfig) {
      if (isHidden(fieldConfig)) {
        return null;
      }
      return undefined;
    },
    [MapperKind.FIELD](fieldConfig) {
      if (isHidden(fieldConfig)) {
        return null;
      }
      return undefined;
    },
    [MapperKind.ARGUMENT](argConfig) {
      if (isHidden(argConfig)) {
        return null;
      }
      return undefined;
    },
  });
}
