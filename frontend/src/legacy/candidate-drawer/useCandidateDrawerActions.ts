import { useCallback, useEffect, useState } from "react";

interface UseCandidateDrawerActionsInput {
  isDrawerOpen: boolean;
  selectedCandidateId: string | null;
}

export function useCandidateDrawerActions({
  isDrawerOpen,
  selectedCandidateId,
}: UseCandidateDrawerActionsInput) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [transferJobModalOpen, setTransferJobModalOpen] = useState(false);
  const [dataQualityActionLoading, setDataQualityActionLoading] = useState(false);

  useEffect(() => {
    setEditModalOpen(false);
    setTransferJobModalOpen(false);
  }, [selectedCandidateId]);

  useEffect(() => {
    if (isDrawerOpen) return;
    setTransferJobModalOpen(false);
    setEditModalOpen(false);
  }, [isDrawerOpen]);

  const handleEditOpen = useCallback(() => setEditModalOpen(true), []);
  const handleEditClose = useCallback(() => setEditModalOpen(false), []);
  const handleTransferJobOpen = useCallback(() => setTransferJobModalOpen(true), []);
  const handleTransferJobClose = useCallback(() => setTransferJobModalOpen(false), []);

  return {
    editModalOpen,
    setEditModalOpen,
    handleEditOpen,
    handleEditClose,
    transferJobModalOpen,
    setTransferJobModalOpen,
    handleTransferJobOpen,
    handleTransferJobClose,
    dataQualityActionLoading,
    setDataQualityActionLoading,
  };
}
