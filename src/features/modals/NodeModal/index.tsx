import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,
  Textarea,
  Group,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import toast from "react-hot-toast";
import { VscEdit, VscSave, VscClose } from "react-icons/vsc";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";

const safeClone = <T,>(v: T): T => {
  // Prefer structuredClone when available (preserves more types); fallback to JSON clone
  // structuredClone exists in modern browsers/node 17+
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (typeof structuredClone !== "undefined") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
};

// return a user-friendly serialized representation for the node.
// - If a single value row: show the raw primitive (unquoted when possible) or pretty JSON for objects/arrays
// - If keyed rows: return an object JSON with only primitive (non-array/object) entries
const normalizeNodeData = (nodeRows?: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";

  if (nodeRows.length === 1 && !nodeRows[0].key) {
    const singleVal = nodeRows[0].value;
    if (typeof singleVal === "object") return JSON.stringify(singleVal, null, 2);
    return `${singleVal}`;
  }

  const obj: Record<string, unknown> = {};
  nodeRows.forEach((row) => {
    if (row.type !== "array" && row.type !== "object" && row.key) {
      obj[row.key] = row.value;
    }
  });

  // If no primitive keys were found, show an empty object
  return Object.keys(obj).length ? JSON.stringify(obj, null, 2) : "{}";
};

// return json path in more canonical format $["customer"][0]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map((seg) =>
    typeof seg === "number" ? `[${seg}]` : `["${String(seg).replace(/"/g, '\\"')}"]`
  );
  return `$${segments.join("")}`;
};

export const NodeModal: React.FC<ModalProps> = ({ opened, onClose }) => {
  const nodeData = useGraph((s) => s.selectedNode);
  const setContents = useFile((s) => s.setContents);
  const getContents = useFile((s) => s.getContents);

  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState("");
  const [originalValue, setOriginalValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [validationHint, setValidationHint] = useState<string | null>(null);

  // Initialize edit values when modal opens or node changes
  useEffect(() => {
    if (opened && nodeData) {
      const normalized = normalizeNodeData(nodeData.text ?? []);
      setEditedValue(normalized);
      setOriginalValue(normalized);
      setIsEditing(false);
      setValidationHint(null);
    }
  }, [opened, nodeData]);

  const isDirty = useMemo(() => editedValue !== originalValue, [editedValue, originalValue]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setValidationHint(null);
  }, []);

  const handleCancel = useCallback(() => {
    setEditedValue(originalValue);
    setIsEditing(false);
    setValidationHint(null);
    toast("Changes discarded", { icon: "ℹ️" });
  }, [originalValue]);

  // Robust update helper: clones root, ensures intermediate objects/arrays exist, assigns/merges as appropriate
  const updateJsonByPath = useCallback(
    (obj: any, path: (string | number)[], newValue: any) => {
      if (!path || path.length === 0) return newValue;

      const cloned = safeClone(obj);
      let current = cloned;

      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        const nextSegment = path[i + 1];
        if (current[segment] === undefined) {
          current[segment] = typeof nextSegment === "number" ? [] : {};
        }
        current = current[segment];
      }

      const last = path[path.length - 1];

      // If both current[last] and newValue are objects (non-array), merge shallowly to preserve other keys
      if (
        newValue !== null &&
        typeof newValue === "object" &&
        !Array.isArray(newValue) &&
        current[last] !== null &&
        typeof current[last] === "object" &&
        !Array.isArray(current[last])
      ) {
        current[last] = { ...current[last], ...newValue };
      } else {
        current[last] = newValue;
      }

      return cloned;
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!nodeData) return;
    if (!isDirty) {
      toast("No changes to save", { icon: "ℹ️" });
      return;
    }

    setIsSaving(true);
    setValidationHint(null);

    try {
      const currentContents = getContents();
      let jsonData: any;
      try {
        jsonData = JSON.parse(currentContents);
      } catch {
        toast.error("Current file is not valid JSON. Cannot save.");
        setIsSaving(false);
        return;
      }

      // Try parsing as JSON. If invalid, we'll save the raw string as a JSON string (same behavior as before)
      let parsedEditedValue: any;
      let editedIsValidJson = true;
      try {
        parsedEditedValue = JSON.parse(editedValue);
      } catch {
        editedIsValidJson = false;
        // treat as string (the JSON.stringify of the root will quote it)
        parsedEditedValue = editedValue;
      }

      // If it's not valid JSON, inform user the value will be saved as a string
      if (!editedIsValidJson) {
        setValidationHint("Edited value is not valid JSON — it will be saved as a string.");
      }

      const updatedJson = updateJsonByPath(jsonData, nodeData.path || [], parsedEditedValue);
      const newContents = JSON.stringify(updatedJson, null, 2);
      await setContents({ contents: newContents });

      setOriginalValue(editedValue);
      setIsEditing(false);
      toast.success("Node updated successfully!");
    } catch (error) {
      console.error("Error saving node:", error);
      toast.error("Failed to save changes. Please check your JSON syntax.");
    } finally {
      setIsSaving(false);
    }
  }, [editedValue, getContents, nodeData, isDirty, setContents, updateJsonByPath]);

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
              <CodeHighlight code={editedValue} miw={350} maw={600} language="json" withCopyButton />
            </ScrollArea.Autosize>
          ) : (
            <Textarea
              value={editedValue}
              onChange={(e) => {
                setEditedValue(e.currentTarget.value);
                setValidationHint(null);
              }}
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

        {validationHint && (
          <Text fz="xs" color="red">
            {validationHint}
          </Text>
        )}

        <Group justify="flex-end" gap="sm" mt="xs">
          {!isEditing ? (
            <Button leftSection={<VscEdit size={16} />} onClick={handleEdit} variant="light" size="sm">
              Edit
            </Button>
          ) : (
            <>
              <Button
                leftSection={<VscClose size={16} />}
                onClick={handleCancel}
                variant="default"
                size="sm"
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                leftSection={<VscSave size={16} />}
                onClick={handleSave}
                variant="filled"
                size="sm"
                disabled={isSaving || !isDirty}
                loading={isSaving}
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