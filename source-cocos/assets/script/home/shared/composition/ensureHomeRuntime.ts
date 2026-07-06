import { Node } from 'cc';
import { HomeRuntime } from '../../bootstrap/HomeRuntime';
import { HomeSharedRuntime } from './HomeSharedRuntime';
import { isHomeSharedRuntimeEnabled } from './runtimeSwitch';

/**
 * 保留旧入口与新入口的并行装配点。
 * PR5 起 HomeController 通过该入口挂载 runtime，并由 runtimeSwitch 决定模式。
 */
export function ensureHomeRuntime(root: Node): void {
    if (isHomeSharedRuntimeEnabled()) {
        HomeSharedRuntime.ensureMounted(root);
        return;
    }

    HomeRuntime.ensureMounted(root);
}
