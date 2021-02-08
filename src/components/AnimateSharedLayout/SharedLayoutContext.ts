import { createContext } from "react"
import { VisualElement } from "../../render/types"
import { Presence } from "./types"

/**
 * Handlers for batching sync layout lifecycles. We batches these processes to cut
 * down on layout thrashing
 */
export interface SyncLayoutLifecycles {
    measureLayout: (child: VisualElement) => void
    layoutReady: (child: VisualElement) => void
    parent?: VisualElement
}

/**
 * The exposed API for children to add themselves to the batcher and to flush it.
 */
export interface SyncLayoutBatcher {
    add: (child: VisualElement) => void
    flush: (handler?: SyncLayoutLifecycles) => void
}

/**
 * Extra API methods available to children if they're a descendant of AnimateSharedLayout
 */
export interface SharedLayoutSyncMethods extends SyncLayoutBatcher {
    syncUpdate: (force?: boolean) => void
    forceUpdate: () => void
    register: (child: VisualElement) => void
    remove: (child: VisualElement) => void
    getLeadVisualElement: (layoutId?: string) => VisualElement | undefined
}

/**
 * Default handlers for batching VisualElements
 */
const defaultHandler: SyncLayoutLifecycles = {
    measureLayout: (child) => child.updateLayoutMeasurement(),
    layoutReady: (child) => child.notifyLayoutReady(),
}

/**
 * Create a batcher to process VisualElements
 */
export function createBatcher(): SyncLayoutBatcher {
    const queue = new Set<VisualElement>()

    return {
        add: (child) => queue.add(child),
        flush: ({ measureLayout, layoutReady, parent } = defaultHandler) => {
            const resetAndMeasure = () => {
                /**
                 * Write: Reset any transforms on children elements so we can read their actual layout
                 */
                queue.forEach((child) => child.resetTransform())

                /**
                 * Read: Measure the actual layout
                 */
                queue.forEach(measureLayout)
            }

            parent
                ? parent.withoutTransform(resetAndMeasure)
                : resetAndMeasure()

            /**
             * Write: Notify the VisualElements they're ready for further write operations.
             */
            queue.forEach(layoutReady)

            /**
             * After all children have started animating, ensure any Entering components are set to Present.
             * If we add deferred animations (set up all animations and then start them in two loops) this
             * could be moved to the start loop. But it needs to happen after all the animations configs
             * are generated in AnimateSharedLayout as this relies on presence data
             */
            queue.forEach((child) => {
                if (child.isPresent) child.presence = Presence.Present
            })

            queue.clear()
        },
    }
}

export function isSharedLayout(
    context: SyncLayoutBatcher | SharedLayoutSyncMethods
): context is SharedLayoutSyncMethods {
    return !!(context as any).forceUpdate
}

export const SharedLayoutContext = createContext<
    SyncLayoutBatcher | SharedLayoutSyncMethods
>(createBatcher())

/**
 * @internal
 */
export const FramerTreeLayoutContext = createContext<
    SyncLayoutBatcher | SharedLayoutSyncMethods
>(createBatcher())
