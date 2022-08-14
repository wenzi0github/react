/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import assign from 'shared/assign';

/**
 * 若Component有默认属性defaultProps，则baseProps中没有设置的属性，使用defaultProps中的数据进行填充
 * 若没有默认属性，则直接返回
 * @param Component
 * @param baseProps
 * @returns {Object}
 */
export function resolveDefaultProps(Component: any, baseProps: Object): Object {
  if (Component && Component.defaultProps) {
    // Resolve default props. Taken from ReactElement
    const props = assign({}, baseProps);
    const defaultProps = Component.defaultProps;
    for (const propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
    return props;
  }
  return baseProps;
}
