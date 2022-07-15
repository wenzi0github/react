/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type RootTag = 0 | 1; // 根的类型

export const LegacyRoot = 0; // 旧的开发模式的根类型
export const ConcurrentRoot = 1; // 并发模式的根类型
