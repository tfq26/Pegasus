import type { HTMLAttributes, Ref } from "vue";

export interface TreeViewElement {
    id: string;
    name: string;
    isSelectable?: boolean;
    children?: TreeViewElement[];
}

export interface TreeProps {
    class?: HTMLAttributes["class"];
    initialSelectedId?: string;
    indicator?: boolean;
    elements: TreeViewElement[];
    initialExpandedItems?: string[];
    openIcon?: string;
    closeIcon?: string;
    fileIcon?: string;
    direction?: "rtl" | "ltr";
    isDeleteMode?: boolean;
}

export interface TreeContextProps {
    selectedId: Ref<string | undefined>;
    expandedItems: Ref<string[] | undefined>;
    indicator: boolean;
    openIcon: string;
    closeIcon: string;
    fileIcon: string;
    direction: "rtl" | "ltr";
    isDeleteMode: Ref<boolean>;
    handleExpand: (id: string) => void;
    selectItem: (id: string, event?: MouseEvent) => void;
    setExpandedItems: (items: string[] | undefined) => void;
}

export interface BaseItemProps {
    class?: HTMLAttributes["class"];
    id: string;
    name: string;
    isSelectable?: boolean;
    isSelect?: boolean;
    isDeleteMode?: boolean;
}

export interface FolderProps extends BaseItemProps {
    openIcon?: string;
    closeIcon?: string;
}

export interface FileProps extends BaseItemProps {
    fileIcon?: string;
}

export const TREE_CONTEXT_SYMBOL = Symbol("TREE_CONTEXT_SYMBOL");
