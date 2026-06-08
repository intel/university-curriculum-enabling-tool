# Curriculum Builder

The Curriculum Builder is designed for faculty members to create and refine course content, build structured curricula, and continuously improve teaching materials.

This guide walks through the full workflow: **Landing page → Model → Courses → Programme → Download Installation Package**.

## Select Curriculum Builder Persona

1. On the application home page, click **Curriculum Builder Persona**.
2. Click **Get Started**.

    ![Curriculum Builder persona selection on the home page](../../assets/images/curriculum-builder/cb-login.png)

## Landing Page

After selecting the persona, the landing page displays a summary of existing models, courses, and programmes.

![Curriculum Builder landing page showing a summary of models, courses, and programmes](../../assets/images/curriculum-builder/cb-landing-page.png)

## Model

At least one AI model must be added before creating a course. The model provides the intelligence behind course content generation.

1. Click **Add Model** on the Model page.

    ![Model page with the Add Model button](../../assets/images/curriculum-builder/cb-add-model1.png)

2. Select a model from the **Ollama*** Library and click **Download**.

    !!! info
        The available model sources depend on the AI Model Provider configured during setup.

    ![Ollama Library model selection dialog](../../assets/images/curriculum-builder/cb-add-model2.png)

3. Once the download completes, the model appears on the Model page and is ready to use.

    ![Model page displaying a downloaded model](../../assets/images/curriculum-builder/cb-model-page-with-model.png)

## Courses

A course is the core unit of content in the curriculum. Each course is linked to an AI model that powers its learning experience. Create at least one course before building a programme.

1. Click **Create Course** on the Course page.

    ![Course page with the Create Course button](../../assets/images/curriculum-builder/cb-course-page.png)

2. Fill in the required course details and click **Next**.

    ![Course creation form — details step](../../assets/images/curriculum-builder/cb-add-course1.png)

3. Select the downloaded model in the **Model** section, then click **Create Course**.

    ![Course creation form — model selection step](../../assets/images/curriculum-builder/cb-add-course2.png)

4. The Course page reloads displaying the newly created course.

    ![Course page displaying the newly created course](../../assets/images/curriculum-builder/cb-add-course3.png)

## Programme

A programme groups one or more courses into a structured learning path. Create a programme and assign courses to it before exporting the installation package for the Expert Advisor and Learning Companion.

1. Click **Create Programme** on the Programme page.

    ![Programme page with the Create Programme button](../../assets/images/curriculum-builder/cb-programm-page.png)

2. Fill in the required programme details and click **Next**.

    ![Programme creation form — details step](../../assets/images/curriculum-builder/cb-programme-creation1.png)

3. Select the course in the **Available Courses** section, then click **Create Programme**.

    ![Programme creation form — course selection step](../../assets/images/curriculum-builder/cb-programme-creation2.png)

4. The Programme page reloads displaying the newly created programme.

    ![Programme page displaying the newly created programme](../../assets/images/curriculum-builder/cb-programme-created.png)

## Download Installation Package

The installation package bundles the programme content for distribution to Expert Advisor and Learning Companion users.

1. On the Programmes dashboard, click **...** beside the target programme and select **Download Installation Package**.

    ![Programme dashboard showing the Download Installation Package option](../../assets/images/curriculum-builder/cb-export-pkg1.png)

2. Select the target user package and click **Download Package**. The package downloads automatically and is ready to share with the target users.

    ![Installation package download dialog with target user selection](../../assets/images/curriculum-builder/cb-export-pkg2.png)

## AI Chat

The Chat page allows you to chat with a downloaded model using Retrieval-Augmented Generation (RAG).

1. Select the model from the top-left corner.

    ![Model selector in the top-left corner of the Chat page](../../assets/images/general/select-llm-model.png)

2. Click **Add Source** in the bottom-left corner.

    ![Add Source button in the bottom-left corner of the Chat page](../../assets/images/general/add-source1.png)

3. Upload your document and click **Upload**.

    !!! info
        The currently supported format is PDF only.

    ![Document upload dialog](../../assets/images/general/add-source2.png)

4. Check the checkbox next to a source in the sources list.

    !!! info
        Selecting a document as a knowledge source is optional.

    ![Sources list with checkbox selection](../../assets/images/general/apply-source.png)

5. Start chatting with the selected AI model.

    ![Chat interface with the selected AI model](../../assets/images/general/chat-with-llm.png)

---
