/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Lane, Lanes} from './ReactFiberLane.old';

import {
  NoLane,
  SyncLane,
  InputContinuousLane,
  DefaultLane,
  IdleLane,
  getHighestPriorityLane,
  includesNonIdleWork,
} from './ReactFiberLane.old';

export opaque type EventPriority = Lane;

/**
 * 事件的优先级
 * 可以看到React的事件优先级的值还是使用的Lane的值，那为什么不直接使用Lane呢？
 * 我觉得可能是为了不与Lane机制耦合，后面事件优先级有什么变动的话，可以直接修改而不会影响到Lane。
 */
export const DiscreteEventPriority: EventPriority = SyncLane; // 离散事件优先级，例如：点击事件，input输入等触发的更新任务，优先级最高
export const ContinuousEventPriority: EventPriority = InputContinuousLane; // 连续事件优先级，例如：滚动事件，拖动事件等，连续触发的事件
export const DefaultEventPriority: EventPriority = DefaultLane; // 默认事件优先级，例如：setTimeout触发的更新任务
export const IdleEventPriority: EventPriority = IdleLane; // 闲置事件优先级，优先级最低

let currentUpdatePriority: EventPriority = NoLane; // 全局存储事件的优先级

/**
 * 获取当前更新的优先级
 * @returns {EventPriority}
 */
export function getCurrentUpdatePriority(): EventPriority {
  return currentUpdatePriority;
}

/**
 * 设置当前更新的优先级
 * @param newPriority
 */
export function setCurrentUpdatePriority(newPriority: EventPriority) {
  currentUpdatePriority = newPriority;
}

/**
 * 以指定的优先级执行某个方法，然后再恢复到之前的优先级
 * @param priority
 * @param fn
 * @returns {T}
 */
export function runWithPriority<T>(priority: EventPriority, fn: () => T): T {
  const previousPriority = currentUpdatePriority;
  try {
    currentUpdatePriority = priority;
    return fn();
  } finally {
    currentUpdatePriority = previousPriority;
  }
}

export function higherEventPriority(
  a: EventPriority,
  b: EventPriority,
): EventPriority {
  return a !== 0 && a < b ? a : b;
}

export function lowerEventPriority(
  a: EventPriority,
  b: EventPriority,
): EventPriority {
  return a === 0 || a > b ? a : b;
}

/**
 * 判断后一个的优先级是否高于前面的优先级
 * @param {EventPriority} a
 * @param {EventPriority} b
 * @returns {boolean}
 */
export function isHigherEventPriority(
  a: EventPriority,
  b: EventPriority,
): boolean {
  return a !== 0 && a < b;
}

/**
 * lanes优先级转为事件优先级
 * @param lanes
 * @returns {EventPriority}
 */
export function lanesToEventPriority(lanes: Lanes): EventPriority {
  const lane = getHighestPriorityLane(lanes); // 获取优先级最高的lane
  if (!isHigherEventPriority(DiscreteEventPriority, lane)) {
    return DiscreteEventPriority;
  }
  if (!isHigherEventPriority(ContinuousEventPriority, lane)) {
    return ContinuousEventPriority;
  }
  if (includesNonIdleWork(lane)) {
    return DefaultEventPriority;
  }
  return IdleEventPriority;
}
