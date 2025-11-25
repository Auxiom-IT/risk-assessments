import { useState, useRef, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../context/AppStateContext';
import { TrackedButton } from '../TrackedButton';
import { trackImport } from '../../utils/analytics';
import Footer from '../Footer';
import { Toast, ToastType } from '../Toast';

interface ToastState {
  message: string;
  type: ToastType;
}

const Import = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { importJSON } = useAppState();
  const [raw, setRaw] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const onImport = () => {
    const result = importJSON(raw);

    showToast(
      result.success ? t('import.successImport') : `${t('import.errorInvalidJSON')} ${result.error ?? ''}`,
      result.success ? 'success' : 'error'
    );
    trackImport('json', result.success);

    // Navigate to questionnaire after successful import
    if (result.success) {
      setTimeout(() => navigate('/questionnaire'), 1500);
    }
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.json')) {
      showToast(t('import.errorFileType'), 'error');
      return;
    }

    // Validate file size (e.g., max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast(t('import.errorFileSize'), 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setRaw(content);
      const result = importJSON(content);
      showToast(
        result.success ? t('import.successFileImport') : `${t('import.errorInvalidJSON')} ${result.error ?? ''}`,
        result.success ? 'success' : 'error'
      );
      trackImport('json', result.success);

      // Navigate to questionnaire after successful import
      if (result.success) {
        setTimeout(() => navigate('/questionnaire'), 1500);
      }
    };
    reader.onerror = () => {
      showToast(t('import.errorFileRead'), 'error');
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className='panel'>
      <h2>{t('import.title')}</h2>
      <p>{t('import.description')}</p>

      <div className='import-methods'>
        <div className='file-upload'>
          <label htmlFor='file-input'>
            <TrackedButton
              trackingName='upload_json_file'
              onClick={() => fileInputRef.current?.click()}
            >
              {t('import.uploadFile')}
            </TrackedButton>
          </label>
          <input
            ref={fileInputRef}
            id='file-input'
            type='file'
            accept='.json,application/json'
            onChange={handleFileUpload}
            className='hidden-file-input'
          />
        </div>

        <p className='import-divider'>{t('import.or')}</p>

        <textarea
          rows={8}
          placeholder={t('import.pasteJSON')}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <div className='actions'>
          <TrackedButton trackingName='import_json' onClick={onImport}>
            {t('import.importButton')}
          </TrackedButton>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <Footer />
    </div>
  );
};

export default Import;
