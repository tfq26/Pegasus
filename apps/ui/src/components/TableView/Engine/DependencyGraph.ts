import type { CellPosition } from './types';
import { posToKey, keyToPos } from './types';

export class DependencyGraph {
    // Who needs me? (Key -> Set of Keys that depend on Key)
    // e.g., A1 is needed by B1. dependents.get(A1) = {B1}
    private dependents: Map<string, Set<string>> = new Map();

    // Who do I need? (Key -> Set of Keys that Key depends on)
    // e.g., B1 needs A1. dependencies.get(B1) = {A1}
    private dependencies: Map<string, Set<string>> = new Map();

    /**
     * Registers that `dependent` depends on `dependency`.
     * e.g., if B1 = A1 + 1, registerDependency(B1, A1)
     */
    addDependency(dependent: CellPosition, dependency: CellPosition) {
        const depKey = posToKey(dependent);
        const srcKey = posToKey(dependency);

        // Add to 'dependencies' (My needs)
        if (!this.dependencies.has(depKey)) {
            this.dependencies.set(depKey, new Set());
        }
        this.dependencies.get(depKey)!.add(srcKey);

        // Add to 'dependents' (Who needs them)
        if (!this.dependents.has(srcKey)) {
            this.dependents.set(srcKey, new Set());
        }
        this.dependents.get(srcKey)!.add(depKey);
    }

    /**
     * Clears all dependencies for a cell (e.g., before re-parsing a formula).
     */
    clearDependencies(cell: CellPosition) {
        const key = posToKey(cell);
        const existingDeps = this.dependencies.get(key);

        if (existingDeps) {
            // Remove myself from their 'dependents' list
            for (const srcKey of existingDeps) {
                this.dependents.get(srcKey)?.delete(key);
            }
            this.dependencies.delete(key);
        }
    }

    /**
     * Returns a list of cells that need to be recalculated when `cell` changes.
     * Performs a topological sort / BFS to find all downstream dependents.
     */
    getDependents(cell: CellPosition): CellPosition[] {
        const result: Set<string> = new Set();
        const queue: string[] = [posToKey(cell)];
        const visited: Set<string> = new Set(); // Cycle detection could happen here

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);

            const directDependents = this.dependents.get(current);
            if (directDependents) {
                for (const dep of directDependents) {
                    if (!result.has(dep)) {
                        result.add(dep);
                        queue.push(dep);
                    }
                }
            }
        }

        return Array.from(result).map(keyToPos);
    }

    /**
     * Returns adjacent dependencies (direct parents) for debugging/visualization.
     */
    getDirectDependencies(cell: CellPosition): CellPosition[] {
        const key = posToKey(cell);
        const deps = this.dependencies.get(key);
        if (!deps) return [];
        return Array.from(deps).map(keyToPos);
    }
}
