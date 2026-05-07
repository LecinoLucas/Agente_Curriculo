import { useCallback, useEffect, useState } from "react";

interface UseCandidateDrawerActionsInput {
  isDrawerOpen: boolean;
  selectedCandidateId: string | null;
}

export function useCandidateDrawerActions({ isDrawerOpen, selectedCandidateId }: UseCandidateDrawerActionsInput) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addJobModalOpen, setAddJobModalOpen] = useState(false);
  const [transferJobModalOpen, setTransferJobModalOpen] = useState(false);
  const [dataQualityActionLoading, setDataQualityActionLoading] = useState(false);

  useEffect(() => {
    setEditModalOpen(false);
    setAddJobModalOpen(false);
    setTransferJobModalOpen(false);
  }, [selectedCandidateId]);

  useEffect(() => {
    if (isDrawerOpen) return;
    setAddJobModalOpen(false);
    setTransferJobModalOpen(false);
    setEditModalOpen(false);
  }, [isDrawerOpen]);

  const handleEditOpen = useCallback(() => setEditModalOpen(true), []);
  const handleEditClose = useCallback(() => setEditModalOpen(false), []);
  const handleAddJobOpen = useCallback(() => setAddJobModalOpen(true), []);
  const handleAddJobClose = useCallback(() => setAddJobModalOpen(false), []);
  const handleTransferJobOpen = useCallback(() => setTransferJobModalOpen(true), []);
  const handleTransferJobClose = useCallback(() => setTransferJobModalOpen(false), []);

  return {
    editModalOpen,
    setEditModalOpen,
    handleEditOpen,
    handleEditClose,
    addJobModalOpen,
    setAddJobModalOpen,
    handleAddJobOpen,
    handleAddJobClose,
    transferJobModalOpen,
    setTransferJobModalOpen,
    handleTransferJobOpen,
    handleTransferJobClose,
    dataQualityActionLoading,
    setDataQualityActionLoading,
  };
}
