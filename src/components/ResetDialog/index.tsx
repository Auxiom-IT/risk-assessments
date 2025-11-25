import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ResetDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onReset: () => void;
  onExportAndReset: () => void;
  hasData: boolean;
}

const ResetDialog: React.FC<ResetDialogProps> = ({
  isOpen,
  onCancel,
  onReset,
  onExportAndReset,
  hasData,
}) => {
  const { t } = useTranslation('common');
  const [step, setStep] = useState<'confirm' | 'export'>('confirm');
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open/close the dialog using the native dialog API
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Reset to confirm step when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep('confirm');
    }
  }, [isOpen]);

  // Handle ESC key and backdrop click
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault(); // Prevent default close behavior
      onCancel();
    };

    const handleClick = (e: MouseEvent) => {
      // Close when clicking the backdrop
      const rect = dialog.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        onCancel();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onCancel]);

  const handleClose = () => {
    onCancel();
  };

  const handleExportAndReset = () => {
    onExportAndReset();
    handleClose();
  };

  const handleResetWithoutExport = () => {
    onReset();
    handleClose();
  };

  return (
    <dialog ref={dialogRef} className='modal-content' aria-labelledby='dialog-title'>
      {step === 'confirm' && (
        <>
          <h3 id='dialog-title'>{t('resetDialog.title')}</h3>
          <p dangerouslySetInnerHTML={{ __html: t('resetDialog.description') }} />
          <ul>
            <li>{t('resetDialog.allAnswers')}</li>
            <li>{t('resetDialog.allScans')}</li>
            <li>{t('resetDialog.riskScore')}</li>
          </ul>
          <p>
            <strong>{t('resetDialog.cannotUndo')}</strong>
          </p>
          {hasData && (
            <p className='warning' dangerouslySetInnerHTML={{ __html: t('resetDialog.exportTip') }} />
          )}
          <div className='modal-actions'>
            <button className='btn-secondary' onClick={handleClose}>
              {t('buttons.cancel')}
            </button>
            {hasData && (
              <button
                className='toggle-btn'
                onClick={() => setStep('export')}
              >
                {t('resetDialog.exportFirstButton')}
              </button>
            )}
            <button className='btn-danger' onClick={handleResetWithoutExport}>
              {t('resetDialog.resetButton')}
            </button>
          </div>
        </>
      )}

      {step === 'export' && (
        <>
          <h3 id='dialog-title'>{t('resetDialog.exportTitle')}</h3>
          <p>{t('resetDialog.exportDescription')}</p>
          <p>{t('resetDialog.exportAfterNote')}</p>
          <div className='modal-actions'>
            <button className='btn-secondary' onClick={() => setStep('confirm')}>
              {t('buttons.back')}
            </button>
            <button
              className='btn-danger'
              onClick={handleExportAndReset}
            >
              {t('resetDialog.downloadResetButton')}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
};

export default ResetDialog;
