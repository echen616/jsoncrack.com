import React, { useState, useEffect } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, TextInput, Textarea, Group } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import toast from "react-hot-toast";
import { VscEdit, VscSave, VscClose } from "react-icons/vsc";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
    if (!nodeRows || nodeRows.length === 0) return "{}";
    if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

    const obj = {};
    nodeRows?.forEach(row => {
        if (row.type !== "array" && row.type !== "object") {
            if (row.key) obj[row.key] = row.value;
        }
    });
    return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
    if (!path || path.length === 0) return "$";
    const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
    return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
    const nodeData = useGraph(state => state.selectedNode);
    const setContents = useFile(state => state.setContents);
    const getContents = useFile(state => state.getContents);

    const [isEditing, setIsEditing] = useState(false);
    const [editedValue, setEditedValue] = useState("");
    const [originalValue, setOriginalValue] = useState("");

    // Initialize edit values when modal opens or node changes
    useEffect(() => {
        if (opened && nodeData) {
            const normalized = normalizeNodeData(nodeData.text ?? []);
            setEditedValue(normalized);
            setOriginalValue(normalized);
            setIsEditing(false);
        }
    }, [opened, nodeData]);

    const handleEdit = () => {
        setIsEditing(true);
    };

    const handleCancel = () => {
        setEditedValue(originalValue);
        setIsEditing(false);
        toast("Changes discarded", { icon: "ℹ️" });
    };

    const handleSave = () => {
        try {
            // Parse the current JSON contents
            const currentContents = getContents();
            const jsonData = JSON.parse(currentContents);

            // Parse the edited value
            let parsedEditedValue: any;
            try {
                parsedEditedValue = JSON.parse(editedValue);
            } catch {
                // If not valid JSON, treat as string
                parsedEditedValue = editedValue;
            }

            // Update the JSON at the specified path
            const updatedJson = updateJsonByPath(jsonData, nodeData?.path || [], parsedEditedValue);

            // Convert back to string and update the contents
            const newContents = JSON.stringify(updatedJson, null, 2);
            setContents({ contents: newContents });

            // Update the original value to the new saved value
            setOriginalValue(editedValue);
            setIsEditing(false);

            toast.success("Node updated successfully!");
        } catch (error) {
            console.error("Error saving node:", error);
            toast.error("Failed to save changes. Please check your JSON syntax.");
        }
    };

    const updateJsonByPath = (obj: any, path: (string | number)[], newValue: any) => {
        if (!path || path.length === 0) {
            return newValue;
        }

        const cloned = JSON.parse(JSON.stringify(obj));
        let current = cloned;

        // Navigate to the parent
        for (let i = 0; i < path.length - 1; i++) {
            const segment = path[i];
            if (current[segment] === undefined) {
                current[segment] = typeof path[i + 1] === "number" ? [] : {};
            }
            current = current[segment];
        }

        // Update the final value
        const lastSegment = path[path.length - 1];

        // If the new value is an object with keys matching the old structure, merge it
        if (typeof newValue === "object" && !Array.isArray(newValue) && newValue !== null) {
            if (typeof current[lastSegment] === "object" && !Array.isArray(current[lastSegment])) {
                // Merge the objects
                current[lastSegment] = { ...current[lastSegment], ...newValue };
            } else {
                current[lastSegment] = newValue;
            }
        } else {
            current[lastSegment] = newValue;
        }

        return cloned;
    };

    return (
        <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
            <Stack pb="sm" gap="sm">
                <Stack gap="xs">
                    <Flex justify="space-between" align="center">
                        <Text fz="xs" fw={500}>
                            Content
                        </Text>
                        <CloseButton onClick={onClose} />
                    </Flex>

                    {!isEditing ? (
                        <ScrollArea.Autosize mah={250} maw={600}>
                            <CodeHighlight
                                code={editedValue}
                                miw={350}
                                maw={600}
                                language="json"
                                withCopyButton
                            />
                        </ScrollArea.Autosize>
                    ) : (
                        <Textarea
                            value={editedValue}
                            onChange={e => setEditedValue(e.currentTarget.value)}
                            minRows={6}
                            maxRows={15}
                            autosize
                            styles={{
                                input: {
                                    fontFamily: "monospace",
                                    fontSize: "14px",
                                },
                            }}
                            miw={350}
                            maw={600}
                        />
                    )}
                </Stack>

                <Text fz="xs" fw={500}>
                    JSON Path
                </Text>
                <ScrollArea.Autosize maw={600}>
                    <CodeHighlight
                        code={jsonPathToString(nodeData?.path)}
                        miw={350}
                        mah={250}
                        language="json"
                        copyLabel="Copy to clipboard"
                        copiedLabel="Copied to clipboard"
                        withCopyButton
                    />
                </ScrollArea.Autosize>

                {/* Action Buttons */}
                <Group justify="flex-end" gap="sm" mt="xs">
                    {!isEditing ? (
                        <Button
                            leftSection={<VscEdit size={16} />}
                            onClick={handleEdit}
                            variant="light"
                            size="sm"
                        >
                            Edit
                        </Button>
                    ) : (
                        <>
                            <Button
                                leftSection={<VscClose size={16} />}
                                onClick={handleCancel}
                                variant="default"
                                size="sm"
                            >
                                Cancel
                            </Button>
                            <Button
                                leftSection={<VscSave size={16} />}
                                onClick={handleSave}
                                variant="filled"
                                size="sm"
                            >
                                Save
                            </Button>
                        </>
                    )}
                </Group>
            </Stack>
        </Modal>
    );
};