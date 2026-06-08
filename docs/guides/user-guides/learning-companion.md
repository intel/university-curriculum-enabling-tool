# Learning Companion

The Learning Companion is designed for students who want to independently explore course materials, test their understanding, and plan their studies using AI-powered tools.

This guide covers the full workflow: **Landing Page → Add Courses → Add RAG Document Source → Summary Generator → Quiz Generator → FAQ Generator → AI Chat → Personalized Study Plan Generator**.

## Select Learning Companion Persona

1. On the application home page, click **Learning Companion Persona**.
2. Click **Get Started**.

    ![Learning Companion persona selection on the home page](../../assets/images/learning-companion/lc-login.png)

## Landing Page

After selecting **Get Started** as Learning Companion, the landing page is displayed. Click **Add Courses** to upload courses from the installation package.

![Learning Companion landing page with the Add Courses button](../../assets/images/learning-companion/lc-landing-page.png)

## Add Courses

1. Click **Courses** then click **Add Courses** to upload courses from the installation package.

    ![Courses page](../../assets/images/expert-advisor/ea-courses-page.png)


2. Upload the programme configuration file.

    The programme configuration JSON file is included in the extracted installation package.

    !!! info
        Example programme configuration file name format:

        `programme-<programme_code>-<programme_version>-UCET-<application_version>.json`

    ![Upload Programme JSON dialog](../../assets/images/general/add-courses1.png)

    After uploading the programme configuration file, click **Next**.

2. Select the courses to add.

    Choose the target courses from the available courses list, then click **Add Selected Courses**.

    ![Course selection list with Add Selected Courses button](../../assets/images/general/add-courses2.png)

3. Select the active course.

    Select a course from the course selector in the top-left corner.

    ![Course selector in the top-left corner](../../assets/images/general/select-active-course.png)

## Add RAG Document Source

Uploaded sources are used for Retrieval-Augmented Generation (RAG) to enhance AI responses across all features.

1. Click **Add Source** in the bottom-left corner.

    ![Add Source button in the bottom-left corner](../../assets/images/general/add-source1.png)

2. Upload your document and click **Upload**.

    !!! info
        The currently supported format is PDF only.

    ![Document upload dialog](../../assets/images/general/add-source2.png)

3. Check the checkbox next to a source in the sources list.

    !!! info
        Selecting a document as a knowledge source is optional.

    ![Sources list with checkbox selection](../../assets/images/general/apply-source.png)

## Summary Generator

Generate a summary from a single uploaded document.

!!! info
    Only one document can be selected at a time for summary generation.

1. Select a document using the file selector in the sidebar.

    ![Document file selector in the sidebar](../../assets/images/general/apply-source.png)

2. Select the active course from the course selector in the top-left corner.

    ![Course selector in the top-left corner](../../assets/images/expert-advisor/ea-select-course.png)

3. Click **Generate Summary** at the bottom of the page.

    ![Generate Summary button](../../assets/images/general/generate-summary1.png)

4. Once the summary is generated, scroll to the bottom to find the export options. Select your preferred format to download.

    ![Summary export options](../../assets/images/general/generate-summary2.png)

## Quiz Generator

The Quiz Generator lets you create quizzes based on your learning materials.

1. In the **Quiz** tab, click **Create Quiz**.

    ![Generate quiz page](../../assets/images/learning-companion/lc-generate-quiz1.png)

2. Configure the quiz type using the available options, then click **Start Now!**.

    ![Configure quiz type](../../assets/images/learning-companion/lc-generate-quiz2.png)

3. Answer the quiz questions and click **Next**.

    ![Answer quiz questions](../../assets/images/learning-companion/lc-generate-quiz3.png)

4. Review the quiz summary.

    ![Quiz Summary](../../assets/images/learning-companion/lc-generate-quiz4.png)

## FAQ Generator

1. Check the checkbox next to a source in the sources list to apply a document source.

    ![Sources list with checkbox selection](../../assets/images/general/apply-source.png)

2. Configure the **FAQ Settings**, then click **Generate FAQs**.

    !!! info
        Optionally enter keywords to focus on specific topics.

    ![FAQs Page](../../assets/images/general/generate-faq1.png)

3. Review the generated FAQs. Click **Continue** to generate more FAQs based on the source document.

    ![FAQs output page](../../assets/images/general/generate-faq2.png)


## Personalized Study Plan Generator

1. Upload or select your learning materials using the source selector in the sidebar, then click **Create Study Plan**.

    ![Study plan generator page](../../assets/images/learning-companion/lc-study-plan1.png)

2. Configure your study period, available time, and difficulty level, then click **Generate Study Plan**.

    ![Configure study plan](../../assets/images/learning-companion/lc-study-plan2.png)

3. View your study plan with weekly schedules and resources.

    !!! info
        Download your study plan as a PDF for offline reference.

    ![Study plan review](../../assets/images/learning-companion/lc-study-plan3.png)
---

