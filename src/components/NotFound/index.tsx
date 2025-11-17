import { useTranslation } from 'react-i18next';

const PageNotFound = () => {
  const { t } = useTranslation('common');

  return (
    <div>
      <div className='wrapper'>
        <section>
          {t('notFound.message')}
          {' '}
          <a href='/'>{t('notFound.home')}</a>
          {' '}
          {t('notFound.suffix')}
        </section>
      </div>
    </div>
  );
};

export default PageNotFound;
