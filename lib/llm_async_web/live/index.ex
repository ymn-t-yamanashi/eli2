defmodule LlmAsyncWeb.Index do
  use LlmAsyncWeb, :live_view
  import ThreeWeb.Cg.CgHelper

  def mount(_params, _session, socket) do
    socket =
      assign(socket, text: "実行ボタンを押してください")
      |> assign(input_text: "Elixirについて一言で教えてください")
      |> assign(btn: true)
      |> assign(old_sentence_count: 1)
      |> assign(sentences: [])
      |> assign(talking_no: 0)
      |> assign(talking: false)
      |> assign(task_pid: nil)
      |> assign(data: 0)
      |> load_model("test", "images/test.vrm")

    {:ok, socket}
  end

  def handle_event("start", _, socket) do
    pid_liveview = self()
    input_text = socket.assigns.input_text

    socket =
      assign(socket, btn: false)
      |> assign(text: "")
      |> assign(sentences: [])
      |> assign(old_sentence_count: 1)
      |> assign(talking_no: 0)
      |> assign_async(:ret, fn -> run(pid_liveview, input_text) end)

    {:noreply, socket}
  end

  def handle_event("stop", _, socket) do
    if socket.assigns.task_pid do
      Process.exit(socket.assigns.task_pid, :kill)
    end

    socket =
      assign(socket, btn: true)
      |> assign(sentences: [])
      |> assign(old_sentence_count: 1)
      |> assign(talking_no: 0)
      |> assign(task_pid: nil)
      |> assign(talking: false)
      |> stop_voice_playback()
      |> set_blend_shape("test", "aa", 0)

    {:noreply, socket}
  end

  def handle_event("update_text", %{"text" => new_text}, socket) do
    {:noreply, assign(socket, input_text: new_text)}
  end

  def handle_event("voice_playback_finished", _, %{assigns: assigns} = socket) do
    talking_no = assigns.talking_no + 1
    sentences = assigns.sentences
    text = Enum.at(sentences, talking_no)
    # 最後は"\n"であるため -1
    max_talking_no = Enum.count(sentences) - 1

    socket = speak_next(socket, talking_no, max_talking_no, text)
    {:noreply, socket}
  end

  def handle_event("voice_volume", %{"volume" => v}, socket) do
    volume = voice_volume(socket.assigns.talking, v)

    socket = set_blend_shape(socket, "test", "aa", volume)
    {:noreply, socket}
  end

  def handle_event("load_model", %{"name" => "test", "status" => "completion"}, socket) do
    socket =
      socket
      |> position("test", 0, -1.4, 4.5)
      |> position("test", 0, -1.4, 4.5)
      |> rotation("test", 0, 3.1, 0)
      |> rotation_bone("test", "J_Bip_R_UpperArm", -1.0, 1.2, 0.5)
      |> rotation_bone("test", "J_Bip_L_UpperArm", -1.0, -1.2, -0.5)
      |> set_blend_shape("test", "aa", 0)

    {:noreply, socket}
  end

  def handle_info({:task_pid, pid}, socket) do
    {:noreply, assign(socket, task_pid: pid)}
  end

  def handle_info(%{"done" => false, "response" => response}, %{assigns: assigns} = socket) do
    old_sentence_count = assigns.old_sentence_count
    text = assigns.text <> response
    sentences = String.split(text, ["。", "、"])
    new_sentence_count = Enum.count(sentences)

    socket =
      assign(socket, sentences: sentences)
      |> assign(old_sentence_count: new_sentence_count)
      |> assign(text: text)
      |> speak_first(old_sentence_count, new_sentence_count, sentences)

    {:noreply, socket}
  end

  def handle_info(%{"done" => true}, socket) do
    {:noreply, assign(socket, btn: true)}
  end

  defp synthesize_and_play(text, socket) do
    push_event(socket, "synthesize_and_play", %{
      "text" => text,
      "speaker_id" => "1"
    })
  end

  defp stop_voice_playback(socket) do
    push_event(socket, "stop_voice_playback", %{})
  end

  defp speak_first(socket, _old_sentence_count = 1, _new_sentence_count = 2, sentences) do
    sentences
    |> hd()
    |> synthesize_and_play(socket)
    |> assign(talking: true)
  end

  defp speak_first(socket, _, _, _sentences), do: socket

  defp speak_next(socket, talking_no, max_talking_no, text) when talking_no < max_talking_no do
    synthesize_and_play(text, socket)
    |> assign(talking_no: talking_no)
    |> assign(talking: true)
  end

  defp speak_next(socket, _talking_no, _max_talking_no, _text) do
    assign(socket, talking_no: 0)
    |> assign(btn: true)
    |> assign(talking: false)
  end

  defp run(pid_liveview, text) do
    {_, task_pid} = Task.start_link(fn -> run_ollama(pid_liveview, text) end)
    send(pid_liveview, {:task_pid, task_pid})
    {:ok, %{ret: :ok}}
  end

  def run_ollama(pid_liveview, text) do
    client = Ollama.init()

    {:ok, stream} =
      Ollama.completion(client,
        model: "gemma3:27b",
        prompt: text,
        stream: true
      )

    stream
    |> Stream.each(&send(pid_liveview, &1))
    |> Stream.run()

    send(pid_liveview, %{"done" => true})
  end

  defp voice_volume(true, volume), do: volume * 10
  defp voice_volume(false, _), do: 0

  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="flex h-screen">
        <div id="voicex" class="p-5 w-[800px] h-[800px] overflow-y-auto" phx-hook="Voicex">
          <form>
            <textarea id="text_input" name="text" phx-change="update_text" class="input w-[400px]">{@input_text}</textarea>
          </form>

          <button disabled={!@btn} class="btn" phx-click="start">実行</button>
          <button class="btn btn-error" phx-click="stop">停止</button>

          <div :for={s <- @sentences}>
            {s}
          </div>
        </div>
        <div id="threejs" phx-hook="threejs" phx-update="ignore" data-data={@data}></div>
      </div>
    </Layouts.app>
    """
  end
end
