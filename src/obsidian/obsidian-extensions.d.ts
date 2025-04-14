import { Menu } from 'obsidian'
import { CanvasNode } from './canvas-internal'

declare module 'obsidian' {
    interface Workspace {
        on(
            name: 'canvas:node-menu',
            callback: (menu: Menu, node: CanvasNode) => any,
            ctx?: any
        ): EventRef
    }
}