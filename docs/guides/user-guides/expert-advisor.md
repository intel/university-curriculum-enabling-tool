# Expert Advisor

The Expert Advisor is designed for lecturers who deliver courses using a pre-configured installation package provided by a Curriculum Builder.

This guide covers the full workflow: **Landing Page → Add Courses → Add RAG Document Source → Course Content Generator → Summary Generator → Assessment Generator → FAQ Generator → AI Chat**.

## Select Expert Advisor Persona

1. On the application home page, click **Expert Advisor Persona**.
2. Click **Get Started**.

    ![Expert Advisor persona selection on the home page](../../assets/images/expert-advisor/ea-login.png)

## Landing Page

After selecting **Get Started** as Expert Advisor, the landing page is displayed.

![Expert Advisor landing page](../../assets/images/expert-advisor/ea-landing-page.png)

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

    ![Course selector in the top-left corner](../../assets/images/expert-advisor/ea-select-course.png)

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

## Course Content Generator

Generate teaching materials with RAG-powered content based on your selected source documents.

!!! info
    The quality of generated content depends on the relevance and quality of your source materials.

1. Click **Slide**, then click **Create Teaching Materials**.

    ![Teaching materials creation entry point](../../assets/images/expert-advisor/ea-create-slide1.png)

2. Enter the topic name, configure the available options, then click **Generate Teaching Materials**.

    ![Teaching materials topic input form](../../assets/images/expert-advisor/ea-create-slide2.png)

3. Once generated, use the tabs to navigate between sections. To download, click the **PDF** or **PowerPoint*** icon at the bottom of the page.

    ![Generated teaching materials with download options](../../assets/images/expert-advisor/ea-create-slide3.png)

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

## Assessment Generator

1. Click the **Assessment** tab, then select the assessment type. The steps below use Quiz as an example.

    ![Generate assessment page](../../assets/images/expert-advisor/ea-generate-assessment1.png)

2. Click **Create Quiz**.

    ![Generate quiz page](../../assets/images/expert-advisor/ea-generate-assessment2.png)

3. Enter the quiz title, configure the quiz type using the available options, then click **Generate Quiz**.

    ![Configure quiz type](../../assets/images/expert-advisor/ea-generate-assessment3.png)

4. Review the generated quiz, then click **Save Draft** or **Publish Quiz**.

    ![Quiz Builder](../../assets/images/expert-advisor/ea-generate-assessment4.png)

5. The generated quiz appears in **Your Quiz History**.

    ![Quiz History](../../assets/images/expert-advisor/ea-generate-assessment5.png)


## FAQ Generator

1. Check the checkbox next to a source in the sources list to apply a document source.

    ![Sources list with checkbox selection](../../assets/images/general/apply-source.png)

2. Configure the **FAQ Settings**, then click **Generate FAQs**.

    !!! info
        Optionally enter keywords to focus on specific topics.

    ![FAQs Page](../../assets/images/general/generate-faq1.png)

3. Review the generated FAQs. Click **Continue** to generate more FAQs based on the source document.

    ![FAQs output page](../../assets/images/general/generate-faq2.png)


---


