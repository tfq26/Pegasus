/**
 * LRUCache - Least Recently Used cache for chunk management
 * 
 * Provides O(1) access and automatic eviction of least recently used items.
 * Used by the VirtualDataProvider for managing loaded data chunks.
 */

/**
 * LRU Cache node for doubly-linked list
 */
interface CacheNode<K, V> {
    key: K;
    value: V;
    prev: CacheNode<K, V> | null;
    next: CacheNode<K, V> | null;
}

/**
 * LRUCache - Generic LRU cache implementation
 */
export class LRUCache<K, V> {
    private capacity: number;
    private cache: Map<K, CacheNode<K, V>> = new Map();

    // Doubly-linked list for LRU tracking
    private head: CacheNode<K, V> | null = null;
    private tail: CacheNode<K, V> | null = null;

    // Eviction callback
    private onEvict?: (key: K, value: V) => void;

    constructor(
        capacity: number,
        onEvict?: (key: K, value: V) => void
    ) {
        this.capacity = capacity;
        this.onEvict = onEvict;
    }

    /**
     * Get a value from the cache
     */
    get(key: K): V | undefined {
        const node = this.cache.get(key);

        if (!node) {
            return undefined;
        }

        // Move to front (most recently used)
        this.moveToFront(node);

        return node.value;
    }

    /**
     * Set a value in the cache
     */
    set(key: K, value: V): void {
        const existing = this.cache.get(key);

        if (existing) {
            // Update existing entry
            existing.value = value;
            this.moveToFront(existing);
            return;
        }

        // Create new node
        const node: CacheNode<K, V> = {
            key,
            value,
            prev: null,
            next: this.head
        };

        // Add to front of list
        if (this.head) {
            this.head.prev = node;
        }
        this.head = node;

        if (!this.tail) {
            this.tail = node;
        }

        // Add to cache
        this.cache.set(key, node);

        // Evict if over capacity
        if (this.cache.size > this.capacity) {
            this.evictLRU();
        }
    }

    /**
     * Check if cache has a key
     */
    has(key: K): boolean {
        return this.cache.has(key);
    }

    /**
     * Delete a key from the cache
     */
    delete(key: K): boolean {
        const node = this.cache.get(key);

        if (!node) {
            return false;
        }

        this.removeNode(node);
        this.cache.delete(key);

        return true;
    }

    /**
     * Clear the entire cache
     */
    clear(): void {
        this.cache.clear();
        this.head = null;
        this.tail = null;
    }

    /**
     * Get current cache size
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Get all keys (from most to least recently used)
     */
    keys(): K[] {
        const keys: K[] = [];
        let current = this.head;

        while (current) {
            keys.push(current.key);
            current = current.next;
        }

        return keys;
    }

    /**
     * Get all values (from most to least recently used)
     */
    values(): V[] {
        const values: V[] = [];
        let current = this.head;

        while (current) {
            values.push(current.value);
            current = current.next;
        }

        return values;
    }

    /**
     * Iterate over entries
     */
    forEach(callback: (value: V, key: K) => void): void {
        let current = this.head;

        while (current) {
            callback(current.value, current.key);
            current = current.next;
        }
    }

    /**
     * Move a node to the front of the list (most recently used)
     */
    private moveToFront(node: CacheNode<K, V>): void {
        if (node === this.head) {
            return; // Already at front
        }

        // Remove from current position
        this.removeNode(node);

        // Add to front
        node.prev = null;
        node.next = this.head;

        if (this.head) {
            this.head.prev = node;
        }

        this.head = node;

        if (!this.tail) {
            this.tail = node;
        }
    }

    /**
     * Remove a node from the linked list
     */
    private removeNode(node: CacheNode<K, V>): void {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }

        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }

    /**
     * Evict the least recently used item
     */
    private evictLRU(): void {
        if (!this.tail) return;

        const evicted = this.tail;

        // Call eviction callback
        if (this.onEvict) {
            this.onEvict(evicted.key, evicted.value);
        }

        // Remove from list
        this.removeNode(evicted);

        // Remove from cache
        this.cache.delete(evicted.key);
    }

    /**
     * Resize the cache capacity
     */
    resize(newCapacity: number): void {
        this.capacity = newCapacity;

        // Evict items if over new capacity
        while (this.cache.size > this.capacity) {
            this.evictLRU();
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; capacity: number } {
        return {
            size: this.cache.size,
            capacity: this.capacity
        };
    }
}
