/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

/**
 * HTML nodeType values that represent the type of the node
 */

export const ELEMENT_NODE = 1; // 元素节点，例如 <p> 和 <div> 等
export const TEXT_NODE = 3; // 文本节点，
export const COMMENT_NODE = 8; // 注释节点，如在html中的 <!-- 和 --> 之间的内容
export const DOCUMENT_NODE = 9; // document节点
export const DOCUMENT_FRAGMENT_NODE = 11; // 文档片段节点，DocumentFragment
