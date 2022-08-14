/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type Source = {|
  fileName: string,
  lineNumber: number,
|};

export type ReactElement = {|
  $$typeof: any,

  /**
   * 我们的节点有有三种类型：
   * 1. 普通的html标签，type为该标签的tagName，如div, span等；
   * 2. 当前是Function Component节点时，则type该组件的函数体，即可以执行type()；
   * 3. 当前是Class Component节点，则type为该class，可以通过该type，new出一个实例；
   * 而type对应的是Function Component时，可以给该组件添加defaultProps属性，
   * 当设置了defaultProps，则将未明确传入的属性给到props里
   */
  type: any,
  key: any,
  ref: any,
  props: any,
  // ReactFiber
  _owner: any,

  // __DEV__
  _store: {validated: boolean, ...},
  _self: React$Element<any>,
  _shadowChildren: any,
  _source: Source,
|};
