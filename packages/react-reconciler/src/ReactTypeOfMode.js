/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type TypeOfMode = number;

// 普通模式|Legacy模式，同步渲染，React15-16的生产环境用
export const NoMode = /*                         */ 0b000000;

// 并发模式，异步渲染，React17的生产环境用
// todo: 将要移除该标识，改为读取root的tag来进行判断
// TODO: Remove ConcurrentMode by reading from the root tag instead
export const ConcurrentMode = /*                 */ 0b000001;

// 性能测试模式，用来检测哪里存在性能问题，React16-17开发环境使用
export const ProfileMode = /*                    */ 0b000010;
export const DebugTracingMode = /*               */ 0b000100;
export const StrictLegacyMode = /*               */ 0b001000;
export const StrictEffectsMode = /*              */ 0b010000;
export const ConcurrentUpdatesByDefaultMode = /* */ 0b100000;
