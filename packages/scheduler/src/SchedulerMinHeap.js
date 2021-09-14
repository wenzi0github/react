/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

type Heap = Array<Node>;
type Node = {|
  id: number,
  sortIndex: number,
|};

/**
 * 往队列中插入数据，然后升序排序，即优先级高的排在前面
 * @param {Heap} heap 
 * @param {Node} node 
 */
export function push(heap: Heap, node: Node): void {
  const index = heap.length;
  heap.push(node);
  siftUp(heap, node, index);
}

/**
 * 获取队列最前面的元素，若队列为空，则返回null
 * @param {Heap} heap 队列
 * @returns {Node | null}
 */
export function peek(heap: Heap): Node | null {
  return heap.length === 0 ? null : heap[0];
}

/**
 * 取出队列最前面的元素
 * @param {*} heap 
 * @returns 
 */
export function pop(heap: Heap): Node | null {
  if (heap.length === 0) {
    return null;
  }
  const first = heap[0];
  const last = heap.pop();
  if (last !== first) {
    heap[0] = last;
    siftDown(heap, last, 0);
  }
  return first;
}

/**
 * 插入一个元素，然后按照sortIndex和taskId进行升序，
 * 即sortIndex和taskId越小，排名越靠前，优先级越高
 * @param {*} heap 队列
 * @param {*} node 插入的元素
 * @param {*} i 现在所在的位置
 * @returns
 */
function siftUp(heap, node, i) {
  let index = i;
  // 当队列中有多个元素时，则需要排序，升序
  // 二分查找，然后进行插入
  while (index > 0) {
    const parentIndex = (index - 1) >>> 1; // Math.floor((index-1)/2)
    const parent = heap[parentIndex];
    if (compare(parent, node) > 0) {
      // The parent is larger. Swap positions.
      heap[parentIndex] = node;
      heap[index] = parent;
      index = parentIndex;
    } else {
      // The parent is smaller. Exit.
      return;
    }
  }
}

function siftDown(heap, node, i) {
  let index = i;
  const length = heap.length;
  const halfLength = length >>> 1;
  while (index < halfLength) {
    const leftIndex = (index + 1) * 2 - 1;
    const left = heap[leftIndex];
    const rightIndex = leftIndex + 1;
    const right = heap[rightIndex];

    // If the left or right node is smaller, swap with the smaller of those.
    if (compare(left, node) < 0) {
      if (rightIndex < length && compare(right, left) < 0) {
        heap[index] = right;
        heap[rightIndex] = node;
        index = rightIndex;
      } else {
        heap[index] = left;
        heap[leftIndex] = node;
        index = leftIndex;
      }
    } else if (rightIndex < length && compare(right, node) < 0) {
      heap[index] = right;
      heap[rightIndex] = node;
      index = rightIndex;
    } else {
      // Neither child is smaller. Exit.
      return;
    }
  }
}

/**
 * 对两个节点进行比较，优先比较sortIndex，然后再比较taskid
 * @param {Heap} a
 * @param {Heap} b
 * @returns
 */
function compare(a, b) {
  // Compare sort index first, then task id.
  const diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}
