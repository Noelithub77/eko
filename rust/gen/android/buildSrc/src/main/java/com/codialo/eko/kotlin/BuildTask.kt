import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        try {
            runTauriCli(resolveNpmExecutable())
        } catch (error: Exception) {
            throw GradleException(
                "Tauri Android Studio build helper failed. Start `npm run dev:android`, wait until it prints `Info Opening Android Studio`, keep that terminal running, then press Run in Android Studio.",
                error,
            )
        }
    }

    private fun resolveNpmExecutable(): String {
        val configuredNpm = System.getenv("EKO_NPM_PATH")
        if (!configuredNpm.isNullOrBlank() && File(configuredNpm).isFile) {
            return configuredNpm
        }

        if (!Os.isFamily(Os.FAMILY_WINDOWS)) {
            return "npm"
        }

        val candidates = listOf(
            "C:\\Program Files\\nodejs\\npm.cmd",
            "C:\\Program Files (x86)\\nodejs\\npm.cmd",
        )

        return candidates.firstOrNull { File(it).isFile } ?: "npm.cmd"
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script");

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}
